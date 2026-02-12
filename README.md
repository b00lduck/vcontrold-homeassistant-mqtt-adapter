# vcontrold Home Assistant MQTT Adapter

A TypeScript-based microservice that bridges vcontrold (Viessmann heating control daemon) with Home Assistant via MQTT. This adapter automatically discovers sensors in Home Assistant and periodically polls vcontrold for sensor values.

## Features

- 🔌 **TCP Connection to vcontrold**: Robust TCP client with automatic reconnection
- 🏠 **Home Assistant MQTT Discovery**: Automatic sensor discovery in Home Assistant
- 📊 **Configurable Sensors**: Define any vcontrold commands as sensors
- 🔄 **Automatic Polling**: Configurable polling interval for sensor updates
- 🐳 **Container Support**: Ready-to-deploy OCI container
- ⚙️ **12-Factor App**: All configuration via environment variables
- 📝 **Structured Logging**: Winston-based logging with configurable levels
- 🔒 **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT

## Architecture

```
┌─────────────┐         TCP          ┌──────────────┐
│             │◄────────────────────►│              │
│  vcontrold  │                      │   Adapter    │
│             │                      │              │
└─────────────┘                      └──────┬───────┘
                                            │
                                            │ MQTT
                                            │
                                      ┌─────▼────────┐
                                      │              │
                                      │ Home         │
                                      │ Assistant    │
                                      │              │
                                      └──────────────┘
```

## Prerequisites

- Node.js 22+ (for local development)
- Podman or Docker (for containerized deployment)
- Running vcontrold instance
- Running MQTT broker (e.g., Mosquitto)
- Home Assistant with MQTT integration

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd vcontrold-ha-mqtt-adapter
pnpm install
```

### 2. Configure

Copy the example environment file and configure it:

```bash
cp .env.example .env
cp sensors.example.json sensors.json
```

Edit `.env` with your settings:

```env
# MQTT Configuration
MQTT_BROKER_URL=mqtt://your-mqtt-broker:1883
MQTT_USERNAME=your-mqtt-user
MQTT_PASSWORD=your-mqtt-password
MQTT_CLIENT_ID=vcontrold-adapter
MQTT_DISCOVERY_PREFIX=homeassistant
MQTT_STATE_TOPIC_PREFIX=vcontrold

# vcontrold Configuration
VCONTROLD_HOST=your-vcontrold-host
VCONTROLD_PORT=3002
VCONTROLD_RECONNECT_INTERVAL=5000

# Polling Configuration
VCONTROLD_POLL_INTERVAL=60000

# Logging
LOG_LEVEL=info

# Home Assistant Device Info
HA_DEVICE_NAME=Viessmann Heating
HA_DEVICE_MANUFACTURER=Viessmann
HA_DEVICE_MODEL=Vitotronic
```

### 3. Run Locally

```bash
# Build TypeScript
pnpm run build

# Run the adapter
pnpm start

# Or run in development mode with hot reload
pnpm run dev
```

## Container Deployment

### Using Pre-built Image from GHCR

Pre-built container images are available from GitHub Container Registry:

```bash
# Pull the latest image
podman pull ghcr.io/b00lduck/vcontrold-ha-mqtt-adapter:latest

# Run container
podman run -d \
  --name vcontrold-adapter \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/b00lduck/vcontrold-ha-mqtt-adapter:latest
```

Available tags:

- `latest` - Latest build from main branch
- `v1.0.0`, `1.0`, `1` - Semantic version tags
- `main`, `develop` - Branch-specific builds

Images are built for `linux/amd64` architecture.

### Using Podman Compose (Recommended)

Update your `compose.yml` to use the pre-built image:

```yaml
services:
  vcontrold-adapter:
    image: ghcr.io/b00lduck/vcontrold-ha-mqtt-adapter:latest
    restart: unless-stopped
    env_file: .env
```

```bash
# Start
podman-compose up -d

# View logs
podman-compose logs -f

# Stop
podman-compose down
```

### Building Locally

```bash
# Build image
podman build -t vcontrold-ha-mqtt-adapter .

# Run container
podman run -d \
  --name vcontrold-adapter \
  --env-file .env \
  --restart unless-stopped \
  vcontrold-ha-mqtt-adapter
```

## Configuration

### Environment Variables

| Variable                       | Required | Default             | Description                                      |
| ------------------------------ | -------- | ------------------- | ------------------------------------------------ |
| `MQTT_BROKER_URL`              | ✅       | -                   | MQTT broker URL (e.g., `mqtt://localhost:1883`)  |
| `MQTT_USERNAME`                | ❌       | -                   | MQTT username (if authentication is enabled)     |
| `MQTT_PASSWORD`                | ❌       | -                   | MQTT password (if authentication is enabled)     |
| `MQTT_CLIENT_ID`               | ❌       | `vcontrold-adapter` | MQTT client identifier                           |
| `MQTT_DISCOVERY_PREFIX`        | ❌       | `homeassistant`     | Home Assistant MQTT discovery prefix             |
| `MQTT_STATE_TOPIC_PREFIX`      | ❌       | `vcontrold`         | Prefix for state topics                          |
| `VCONTROLD_HOST`               | ✅       | -                   | vcontrold hostname or IP address                 |
| `VCONTROLD_PORT`               | ❌       | `3002`              | vcontrold TCP port                               |
| `VCONTROLD_RECONNECT_INTERVAL` | ❌       | `5000`              | Reconnection interval in milliseconds            |
| `VCONTROLD_COMMAND_TIMEOUT`    | ❌       | `25000`             | Command timeout in milliseconds (25 seconds)     |
| `VCONTROLD_POLL_INTERVAL`      | ❌       | `60000`             | Polling interval in milliseconds (1 minute)      |
| `LOG_LEVEL`                    | ❌       | `info`              | Logging level (`error`, `warn`, `info`, `debug`) |
| `HA_DEVICE_NAME`               | ❌       | `Vcontrold Adapter` | Device name in Home Assistant                    |
| `HA_DEVICE_MANUFACTURER`       | ❌       | `Viessmann`         | Device manufacturer                              |
| `HA_DEVICE_MODEL`              | ❌       | `vcontrold`         | Device model                                     |

### Sensor Configuration

Sensors are configured in [sensors.json](sensors.json) with a structured format:

```bash
cp sensors.example.json sensors.json
```

Edit the file to define your sensors:

```json
[
  {
    "command": "getTempA",
    "name": "Air Temperature",
    "enabled": true
  },
  {
    "command": "getTempWW",
    "name": "DHW Temperature",
    "enabled": true
  },
  {
    "command": "getPumpeStatusHk1",
    "name": "Heating Pump Status",
    "enabled": true
  },
  {
    "command": "getBrennerLeistung",
    "name": "Burner Power",
    "enabled": false
  }
]
```

Each sensor definition includes:

- **command**: The vcontrold command to execute
- **name**: (Optional) Custom display name in Home Assistant. If omitted, a name is auto-generated from the command
- **enabled**: Set to `false` to disable a sensor without removing it from the configuration

#### Automatic Sensor Detection

The adapter automatically:

- Detects **temperature sensors** and applies °C unit with `temperature` device class
- Identifies **binary sensors** (pumps/status) and creates them as Home Assistant `binary_sensor` entities
- Recognizes **percent sensors** (throttle, mixer, power) and applies % unit
- Detects device classes based on command names (temperature, pressure, power, energy)
- Creates unique sensor IDs

#### Sensor Examples

| Command                     | Auto-generated Name     | Type          | Device Class | Unit |
| --------------------------- | ----------------------- | ------------- | ------------ | ---- |
| `getTempA`                  | Temp A                  | sensor        | temperature  | °C   |
| `getTempWW`                 | Temp WW                 | sensor        | temperature  | °C   |
| `getPumpeStatusHk1`         | Pumpe Status Hk1        | binary_sensor | running      | -    |
| `getDrosselklappenPosition` | Drosselklappen Position | sensor        | -            | %    |
| `getBrennerLeistung`        | Brenner Leistung        | sensor        | power_factor | %    |

## Home Assistant Integration

### Automatic Discovery

The adapter automatically publishes MQTT discovery messages for all configured sensors. After starting the adapter, sensors will appear in Home Assistant under:

- **Settings** → **Devices & Services** → **MQTT** → **Devices**
- Look for the device name you configured (default: "Vcontrold Adapter")

### Manual Configuration (Optional)

If you prefer manual YAML configuration:

```yaml
sensor:
  - platform: mqtt
    name: "Heating Temperature A"
    state_topic: "vcontrold/get_temp_a/state"
    unit_of_measurement: "°C"
    device_class: temperature
    availability:
      - topic: "vcontrold/availability"
```

## Troubleshooting

### Connection Issues

**Problem**: Adapter can't connect to vcontrold

```bash
# Check if vcontrold is running and accessible
telnet your-vcontrold-host 3002

# Check adapter logs
podman-compose logs -f
```

**Problem**: Adapter can't connect to MQTT broker

```bash
# Test MQTT connection
mosquitto_sub -h your-mqtt-broker -t "#" -v

# Check MQTT credentials in .env
```

### Sensor Issues

**Problem**: Sensors not appearing in Home Assistant

1. Check MQTT integration is configured in Home Assistant
2. Verify `MQTT_DISCOVERY_PREFIX` matches Home Assistant configuration
3. Check adapter logs for discovery messages:
   ```bash
   podman-compose logs -f | grep "discovery"
   ```

**Problem**: Sensor values not updating

1. Check polling interval configuration
2. Verify vcontrold commands are correct:
   ```bash
   # Test command manually via telnet
   telnet your-vcontrold-host 3002
   > getTempA
   ```
3. Check adapter logs for command responses

### Debug Mode

Enable debug logging for detailed output:

```env
LOG_LEVEL=debug
```

## Development

### Project Structure

```
vcontrold-ha-mqtt-adapter/
├── src/
│   ├── index.ts              # Application entry point
│   ├── config.ts             # Configuration management
│   ├── logger.ts             # Winston logger setup
│   ├── adapter.ts            # Main adapter logic
│   ├── vcontrold-client.ts   # TCP client for vcontrold
│   └── mqtt-adapter.ts       # MQTT client and HA discovery
├── dist/                     # Compiled JavaScript (generated)
├── .env.example              # Example environment variables
├── sensors.json              # Sensor configuration (created by user)
├── sensors.example.json      # Example sensor configuration
├── .gitignore
├── Containerfile             # Multi-stage OCI container build
├── compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run build

# Watch mode for development
pnpm run watch
```

### Testing

```bash
# Run in development mode
pnpm run dev

# Check logs
tail -f adapter.log
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review adapter logs with `LOG_LEVEL=debug`
3. Open an issue on GitHub with logs and configuration (remove sensitive data)
