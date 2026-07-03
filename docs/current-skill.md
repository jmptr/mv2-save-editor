---
description: Edit Melvor Idle 2 save files (.sav). Use this skill whenever the user uploads a .sav file from Melvor Idle 2 (Melvor2) and wants to modify it — including editing gold/GP, slayer coins, item quantities in the bank, skill XP or levels, or any other save values. Also use when the user asks to "give me X items", "set my level to Y", "add gold", or similar requests alongside a Melvor2 save file. The save format is Brotli-compressed binary (NOT encrypted).
---

# Melvor Idle 2 Save Editor

## Save File Format

Melvor Idle 2 saves are **Brotli-compressed** binary files using .NET `BinaryReader`/`BinaryWriter`
little-endian format. There is NO encryption.

### Decompressing/Recompressing

```python
import brotli
dec = bytearray(brotli.decompress(open('save.sav', 'rb').read()))
# ... edit dec ...
open('out.sav', 'wb').write(brotli.compress(bytes(dec)))
```

Install if needed: `pip install brotli --break-system-packages`

### Binary Primitives

All standard .NET `BinaryReader` little-endian:
- `int32`: 4 bytes signed LE
- `int64`: 8 bytes signed LE
- `double`: 8 bytes IEEE 754 LE
- `bool`: 1 byte (0 or 1)
- `string`: 7-bit length-prefixed UTF-8 (standard .NET BinaryReader format)

```python
def read_string_at(dec, offset):
    result = 0; shift = 0; i = offset
    while True:
        b = dec[i]; i += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80): break
        shift += 7
    return dec[i:i+result].decode('utf-8'), i + result
```

---

## File Layout

```
[int32]     Save version (e.g. 17 = Alpha0_9_1)
[SaveHeader]
  [16 bytes]  UUID (GUID, bytes_le)
  [string]    CharacterName
  [string]    Gamemode
  [int64]     Timestamp (DateTime.ToBinary())
  [string]    ActiveEntityName
  [string]    ActiveEntityIcon
  [string]    ActiveActionName
  [string]    ActiveActionIcon
  [int32]     TotalLevel
  [int64]     GP (cosmetic snapshot only — real GP is in Bank entity)
  [int64]     SlayerCoins (cosmetic snapshot only)
[Game entities]
  [int32]     Entity count
  for each entity:
    [string]  Entity ID (e.g. "MelvorBase:Bank")
    [int32]   Region byte length
    [N bytes] Entity data
[ActionManager state]
[RNG state]
[int32]     SidebarFavouriteOptions count
...
[EventLog]
```

---

## Known Entity IDs

All prefixed with `MelvorBase:`:
`OfflineProgress`, `TimeAndWeather`, `Bank`, `CharacterStatistics`, `Shop`, `Quests`,
`Woodcutting`, `Mining`, `Fishing`, `Firemaking`, `Smithing`, `Cooking`, `Crafting`,
`Runecrafting`, `Fletching`, `Farming`, `Ranching`, `Hunting`, `Beastcrafting`,
`Attack`, `Strength`, `Defence`, `Ranged`, `Magic`, `Hitpoints`, `Prayer`,
`Combat`, `CompletionLog`, `Agility`, `Herblore`, `Thieving`, `Slayer`

---

## Editing Gold (GP)

GP is stored as `int64` in the Bank entity's Wallet section.

**Finding it**: Search for the bytes of the current GP value as `int64` LE within the Bank
entity region. The wallet section contains a `Walleta` marker nearby.

```python
import struct
gp_bytes = struct.pack('<q', current_gp)
idx = dec.index(gp_bytes, bank_start)
struct.pack_into('<q', dec, idx, new_gp)
```

**Tip**: The GP in the SaveHeader is a cosmetic snapshot and updates automatically on next save.
Only patch the wallet value.

---

## Editing Item Quantities in Bank

### Item stack format (StackableInventory)
Each item stack is written as:
```
[int32]   quantity
[bool]    isPlaceholder
[bool]    isLocked
[string]  item ID (e.g. "MelvorBase:AgilityMark")
```

### Finding an item stack
The item ID string is length-prefixed. To find the stack, locate the string and look
**6 bytes before** the length prefix byte (4 bytes qty + 1 bool + 1 bool):

```python
import re, struct

def find_bank_item_stacks(dec, item_id: str, bank_start: int, bank_end: int):
    item_bytes = item_id.encode('utf-8')
    expected_prefix = len(item_bytes)
    results = []
    search = bytes(dec)
    idx = bank_start
    while True:
        idx = search.find(item_bytes, idx, bank_end)
        if idx == -1:
            break
        if dec[idx - 1] == expected_prefix:
            stack_offset = idx - 1 - 6  # back past prefix + qty(4) + placeholder(1) + locked(1)
            qty = struct.unpack_from('<i', dec, stack_offset)[0]
            if 0 <= qty <= 2_000_000_000:
                results.append((stack_offset, qty))
        idx += 1
    return results
```

### Patching quantity
```python
struct.pack_into('<i', dec, stack_offset, new_quantity)
```

**Note**: Quantities are `int32` (max ~2.1 billion). Items must already exist in the bank
(quantity >= 0). Adding brand-new items not present in the save requires inserting bytes
and updating region size prefixes — avoid unless necessary.

### Finding the Bank entity region
Parse entity list after the SaveHeader to find `MelvorBase:Bank`:

```python
def find_entity(dec, header_end, entity_id):
    buf = io.BytesIO(dec[header_end:])
    count = struct.unpack('<i', buf.read(4))[0]
    for _ in range(count):
        # read string
        eid = read_string(buf)
        size = struct.unpack('<i', buf.read(4))[0]
        start = header_end + buf.tell()
        if eid == entity_id:
            return start, size
        buf.seek(size, 1)
```

---

## Editing Skill XP / Level

### ExperienceComponent format
Each skill entity contains an `ExperienceComponent` stored as:
```
[double]  XP
[int32]   LevelCap (usually 120)
[int32]   Level (derived, but stored explicitly)
```

Both XP and Level are stored. Set both consistently.

### XP Table (StandardExperienceTable)

Parameters: `scaling=0.25, exponent_scaling=300.0, base=2^(1/7)`

```python
import math

def compute_xp_table(max_level=120):
    base = math.pow(2.0, 1.0/7.0)
    xp_sum = 0.0
    table = [0.0]  # level 1 = 0 XP
    for i in range(1, max_level):
        xp_sum += math.floor(i + 300.0 * math.pow(base, i))
        table.append(math.floor(0.25 * xp_sum))
    return table

XP_TABLE = compute_xp_table()
# XP_TABLE[level-1] = XP required for that level
```

Key milestones:
| Level | XP Required |
|-------|-------------|
| 50    | 101,331 |
| 75    | 3,576,425 |
| 99    | 13,034,427 |
| 110   | 38,737,657 |
| 120   | 104,273,162 |

### Finding ExperienceComponent in an entity
Each skill entity's Experience data is inside a component region. The component is
identified by the string `"Experience"` in the entity's component list. The double XP value
follows shortly after.

**Practical approach**: Search for the entity's XP value as a `double` within the entity blob,
or search for the known double bytes. Then verify the surrounding context (LevelCap int32
should follow, then Level int32).

```python
import struct

def find_xp_in_entity(dec, entity_start, entity_size, current_xp):
    xp_bytes = struct.pack('<d', current_xp)
    idx = bytes(dec).find(xp_bytes, entity_start, entity_start + entity_size)
    if idx != -1:
        level_cap = struct.unpack_from('<i', dec, idx + 8)[0]
        level = struct.unpack_from('<i', dec, idx + 12)[0]
        if 1 <= level_cap <= 120 and 1 <= level <= 120:
            return idx  # confirmed
    return None

def set_xp_and_level(dec, xp_offset, new_xp, new_level):
    struct.pack_into('<d', dec, xp_offset, new_xp)
    # level_cap at xp_offset+8, leave unchanged
    struct.pack_into('<i', dec, xp_offset + 12, new_level)
```

---

## Full Edit Workflow

```python
import brotli, struct, io

def load_save(path):
    return bytearray(brotli.decompress(open(path, 'rb').read()))

def save_file(dec, path):
    open(path, 'wb').write(brotli.compress(bytes(dec)))

def read_string(buf):
    result = 0; shift = 0
    while True:
        b = buf.read(1)[0]
        result |= (b & 0x7F) << shift
        if not (b & 0x80): break
        shift += 7
    return buf.read(result).decode('utf-8')

def parse_header_size(dec):
    """Returns byte offset where Game entity list begins."""
    buf = io.BytesIO(dec)
    buf.read(4)       # version int32
    buf.read(16)      # UUID bytes
    read_string(buf)  # CharacterName
    read_string(buf)  # Gamemode
    buf.read(8)       # Timestamp int64
    read_string(buf)  # ActiveEntityName
    read_string(buf)  # ActiveEntityIcon
    read_string(buf)  # ActiveActionName
    read_string(buf)  # ActiveActionIcon
    buf.read(4)       # TotalLevel int32
    buf.read(8)       # GP int64
    buf.read(8)       # SlayerCoins int64
    return buf.tell()

def find_entity_offset(dec, header_end, entity_id):
    """Returns (data_start, data_size) for a named entity."""
    buf = io.BytesIO(dec[header_end:])
    count = struct.unpack('<i', buf.read(4))[0]
    for _ in range(count):
        eid = read_string(buf)
        size = struct.unpack('<i', buf.read(4))[0]
        start = header_end + buf.tell()
        if eid == entity_id:
            return start, size
        buf.seek(size, 1)
    return None, None
```

---

## Important Notes

- **Always work on a copy** of the save before editing
- **Bank item quantities** are `int32` (max 2,147,483,647)
- **GP/currency** values are `int64` (max ~9.2 quintillion)
- **Skill XP** is `double`; **Level** is `int32`
- The save header's GP/SlayerCoins fields are cosmetic — they update on next in-game save
- The save version is `17` for Alpha 0.9.1; check `SaveVersion` enum if version checks fail
- Region size prefixes don't need updating for in-place value edits (same byte width)
- Adding new items/entries requires updating region sizes — complex, avoid if possible

## Lessons Learned

- always re-parse offsets fresh from the uploaded file, never reuse offsets from a previous session