import os
from PIL import Image

# Print the current working directory
print("Current working directory:", os.getcwd())

# Use the absolute path to your image file
image_path = r"D:\gameofdeath\skins\image_512(2).png"

# Open the image
img = Image.open(image_path)

# Define tile dimensions
tile_width = 64
tile_height = 64

# Loop over an 8x8 grid to crop the image into 64x64 tiles
for row in range(8):
    for col in range(8):
        left = col * tile_width
        top = row * tile_height
        right = left + tile_width
        bottom = top + tile_height

        # Crop the image tile
        tile = img.crop((left, top, right, bottom))
        # Save the tile to a file
        tile.save(f"tile_{row}_{col}(2).png")
