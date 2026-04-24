# add-device

Add a new device to the vi_power system. Usage: `/project:add-device`

Claude will ask for:
- `deviceid` — unique string ID (e.g. PMP003)
- `deviceName` — display name
- `deviceType` — type (bơm / van / trạm / plc / hmi / máy cắt / máy sản xuất / chiếu sáng)
- `displaygroupid` — which group (GROUP001–GROUP005)
- `location` — physical location string
- `samplingCycle` — seconds between readings (default 60)

## Steps

1. Ask user for the fields above if not provided in the prompt
2. Insert the device into the `devices` collection in MongoDB via mongosh or a Node script
3. Create the corresponding `energy_data_${deviceid}` collection with indexes:
   - `{ timestamp: 1 }`
   - `{ deviceId: 1 }`
   - `{ deviceId: 1, timestamp: 1 }`
4. Confirm success and show the inserted document
