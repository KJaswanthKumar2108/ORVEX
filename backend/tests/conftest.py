import os

# Ensure unit tests do not attempt to connect to external databases or MQTT brokers unless specifically configured
os.environ["DATABASE_URL"] = ""
os.environ["MQTT_ENABLED"] = "false"
os.environ["ENVIRONMENT"] = "test"
