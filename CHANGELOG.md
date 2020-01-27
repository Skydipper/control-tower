# v1.0.0

## 27/1/2020

- Fix grammar for `email exists` error when attempting to register and exisiting user. `email exist` -> `email exists`.
- Add and use `fromEmail` field on oauth plugin configuration (inside each application) as the name of the sender for auth-related emails.
- Change callback URL logic so that priority is:
  - Query param
  - Session
  - Referrer
- Refactor tests to (even) better handle redirect cases
- Refactor tests to better handle redirect cases
- Add pagination to GET users
- Fix regression where 3rd party auth users without email address would not be able to authenticate
- Add healthcheck endpoint and readiness+liveliness checks to k8s config
- Serialize user on response to account confirmation.
