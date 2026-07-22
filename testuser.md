# PicMatch v5 — Test User for Manual / Automated Testing

## Login credentials

| Field        | Value                   |
|--------------|-------------------------|
| Email        | `tester@example.com`    |
| Password     | `Test1234!A`            |
| Username     | `automation_tester`     |
| Role         | `creator`               |
| Verified     | Yes                     |

## How to log in

1. Start the backend (`cd backend && python main.py` or however you run it).
2. Start the frontend (`cd frontend && npm run dev`).
3. Open `http://localhost:5173/login`.
4. Enter the credentials above.


## API login (for scripts / Playwright)

```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@example.com","password":"Test1234!A"}'
```
