# Local Infrastructure

The root Compose file starts TimescaleDB and Mosquitto for local development. Broker configuration is kept here so it can be replaced with an authenticated deployment-specific configuration without coupling it to application code.

The checked-in Mosquitto listener permits anonymous local connections. Compose binds its port to `127.0.0.1`; do not reuse this configuration on a shared or production network.