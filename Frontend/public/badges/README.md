# Badge Images

## File Naming Convention

For each track in your system, you need **2 PNG files**:

1. **Colored version** (shown when track is completed):
   - Format: `{track-id}.png`
   - Example: `python-basics.png`

2. **Grayscale version** (shown when track is not completed):
   - Format: `{track-id}-gray.png`
   - Example: `python-basics-gray.png`

## Track IDs

Check your Firestore `tracks` collection for the exact track IDs. Each track document's ID should match the filename (without extension).

## Example

If you have a track with ID `web-development`:
- Place `web-development.png` (colored badge)
- Place `web-development-gray.png` (grayscale badge)

## Image Specifications

- **Format**: PNG with transparency
- **Recommended size**: 200x200px (will be displayed at ~60px)
- **Style**: Match your color scheme
- **Grayscale**: Should be fully desaturated version of the colored badge
