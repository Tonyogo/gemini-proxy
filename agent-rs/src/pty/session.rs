use nix::fcntl::{fcntl, FcntlArg, OFlag};
use nix::pty::openpty;
use nix::sys::signal::{kill, Signal};
use nix::sys::wait::{waitpid, WaitPidFlag, WaitStatus};
use nix::unistd::{fork, ForkResult, Pid};
use std::ffi::CString;
use std::io::{Error, ErrorKind, Result};
use std::os::fd::{AsRawFd, OwnedFd, RawFd};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::unix::AsyncFd;
use tracing::info;

pub struct PtySession {
    async_master: AsyncFd<OwnedFd>,
    child_pid: Pid,
    is_closed: Arc<AtomicBool>,
}

impl PtySession {
    pub fn spawn(shell: &str, cols: u16, rows: u16) -> Result<Self> {
        let pty_pair = openpty(None, None)
            .map_err(|e| Error::new(ErrorKind::Other, format!("openpty failed: {}", e)))?;

        let master_fd = pty_pair.master;
        let slave_fd = pty_pair.slave;

        // Set initial window size
        Self::set_window_size(master_fd.as_raw_fd(), cols, rows);

        // Make master non-blocking for tokio AsyncFd
        let flags = fcntl(master_fd.as_raw_fd(), FcntlArg::F_GETFL)
            .map_err(|e| Error::new(ErrorKind::Other, format!("fcntl F_GETFL failed: {}", e)))?;
        fcntl(
            master_fd.as_raw_fd(),
            FcntlArg::F_SETFL(OFlag::from_bits_truncate(flags) | OFlag::O_NONBLOCK),
        )
        .map_err(|e| Error::new(ErrorKind::Other, format!("fcntl F_SETFL failed: {}", e)))?;

        // Fork child process
        match unsafe { fork() } {
            Ok(ForkResult::Parent { child }) => {
                // Drop slave in parent process
                drop(slave_fd);

                let async_master = AsyncFd::new(master_fd)?;
                info!("[PTY] Shell spawned: {} (pid={})", shell, child);

                Ok(Self {
                    async_master,
                    child_pid: child,
                    is_closed: Arc::new(AtomicBool::new(false)),
                })
            }
            Ok(ForkResult::Child) => {
                // In child: setup controlling terminal
                drop(master_fd);

                unsafe {
                    if libc::login_tty(slave_fd.as_raw_fd()) != 0 {
                        libc::_exit(1);
                    }

                    // Setup environment variables
                    let set_env = |k: &str, v: &str| {
                        let c_k = CString::new(k).unwrap();
                        let c_v = CString::new(v).unwrap();
                        libc::setenv(c_k.as_ptr(), c_v.as_ptr(), 1);
                    };

                    set_env("TERM", "xterm-256color");
                    set_env("COLORTERM", "truecolor");
                    if std::env::var_os("LANG").is_none() {
                        set_env("LANG", "en_US.UTF-8");
                    }
                    set_env("TERM_PROGRAM", "gemini-proxy-agent");
                    set_env("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN", "1");

                    // Purge terminal multiplexer variables so the spawned shell does not assume it is running inside tmux/screen
                    let unset_env = |k: &str| {
                        let c_k = CString::new(k).unwrap();
                        libc::unsetenv(c_k.as_ptr());
                    };
                    unset_env("TMUX");
                    unset_env("TMUX_PANE");
                    unset_env("STY");
                    unset_env("WINDOW");
                    unset_env("TERM_SESSION_ID");

                    let c_shell = CString::new(shell).unwrap_or_else(|_| CString::new("/bin/bash").unwrap());
                    let arg_i = CString::new("-i").unwrap();
                    let args = [c_shell.as_ptr(), arg_i.as_ptr(), std::ptr::null()];

                    libc::execvp(c_shell.as_ptr(), args.as_ptr());
                    libc::_exit(127);
                }
            }
            Err(e) => Err(Error::new(ErrorKind::Other, format!("fork failed: {}", e))),
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        Self::set_window_size(self.async_master.get_ref().as_raw_fd(), cols, rows);
    }

    fn set_window_size(fd: RawFd, cols: u16, rows: u16) {
        let ws = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        unsafe {
            libc::ioctl(fd, libc::TIOCSWINSZ, &ws);
        }
    }

    pub async fn read(&self, buf: &mut [u8]) -> Result<usize> {
        loop {
            if self.is_closed.load(Ordering::Relaxed) {
                return Ok(0);
            }
            let mut guard = self.async_master.readable().await?;
            match guard.try_io(|inner| {
                let fd = inner.get_ref().as_raw_fd();
                let ret = unsafe { libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
                if ret < 0 {
                    Err(Error::last_os_error())
                } else {
                    Ok(ret as usize)
                }
            }) {
                Ok(Ok(n)) => return Ok(n),
                Ok(Err(ref e)) if e.kind() == ErrorKind::WouldBlock => continue,
                Ok(Err(e)) => return Err(e),
                Err(_would_block) => continue,
            }
        }
    }

    pub async fn write_all(&self, buf: &[u8]) -> Result<()> {
        let mut written = 0;
        while written < buf.len() {
            if self.is_closed.load(Ordering::Relaxed) {
                return Err(Error::new(ErrorKind::BrokenPipe, "PTY is closed"));
            }
            let mut guard = self.async_master.writable().await?;
            match guard.try_io(|inner| {
                let fd = inner.get_ref().as_raw_fd();
                let slice = &buf[written..];
                let ret = unsafe { libc::write(fd, slice.as_ptr() as *const libc::c_void, slice.len()) };
                if ret < 0 {
                    Err(Error::last_os_error())
                } else {
                    Ok(ret as usize)
                }
            }) {
                Ok(Ok(n)) => written += n,
                Ok(Err(ref e)) if e.kind() == ErrorKind::WouldBlock => continue,
                Ok(Err(e)) => return Err(e),
                Err(_would_block) => continue,
            }
        }
        Ok(())
    }

    pub fn check_child_exit(&self) -> Option<i32> {
        match waitpid(self.child_pid, Some(WaitPidFlag::WNOHANG)) {
            Ok(WaitStatus::Exited(_, code)) => Some(code),
            Ok(WaitStatus::Signaled(_, sig, _)) => Some(128 + sig as i32),
            _ => None,
        }
    }

    pub fn kill(&self) {
        if self.is_closed.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = kill(self.child_pid, Signal::SIGTERM);
        // Clean up zombie if it exited
        std::thread::sleep(std::time::Duration::from_millis(50));
        if self.check_child_exit().is_none() {
            let _ = kill(self.child_pid, Signal::SIGKILL);
            let _ = waitpid(self.child_pid, Some(WaitPidFlag::WNOHANG));
        }
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
