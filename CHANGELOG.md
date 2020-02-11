# 09/02/2020
- Modify microservice registration process so that it doesn't go to error by default.
- Refactor cron logic so that long-failing microservices get deleted.
- Save microservice name in endpoint redirect.
- Prevent duplicated tags when saving microservice data to the database.

# 05/02/2020
- Prevent statistics logging for `/healthcheck` endpoint.

# 27/01/2020
- Update `passport-facebook` NPM package version to its latest version.

# 27/01/2020
- Fix grammar for `email exists` error when attempting to register and exisiting user. `email exist` -> `email exists`

# 22/01/2020
- Add and use `fromEmail` field on oauth plugin configuration (inside each application) as the name of the sender for auth-related emails

# 12/12/2019
- Change callback URL logic so that priority is:
    - Query param
    - Session
    - Referer
- Refactor tests to (even) better handle redirect cases

# 11/12/2019
- Refactor tests to better handle redirect cases

# 02/12/2019
- Add pagination to GET users

# 01/12/2019
- Fix regression where 3rd party auth users without email address would not be able to authenticate

# 08/11/2019
- Add healthcheck endpoint and readiness+liveliness checks to k8s config
- Serialize user on response to account confirmation.
