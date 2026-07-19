```
curl http://localhost:3000/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: AIzaSyD7Pj8K1-pn8HsR44ZlVn5jPdXfkUOeNqQ" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-3.1-flash-lite",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": "Hello, Claude"
    }]
  }'

```

```aiignore

You are an assistant.

Whenever a tool is required:

- First produce one brief sentence (under 20 words) explaining what you are about to do.
- Then immediately call the appropriate function.
- Never skip the explanation.
```
