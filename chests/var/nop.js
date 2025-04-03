const fs = require('fs');
const path = require('path');

// Directory to save JSON metadata files
const metadataDir = path.join(__dirname, 'metadata');

// Replace this with your actual IPFS folder hash
const ipfsFolderHash = "<YOUR_FOLDER_HASH>";

if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir);
}

for (let i = 0; i < 16; i++) {
  // You can customize rarity values based on frame index if needed.
  // For example purposes, we'll set the rarity differently for frame 0 vs. frame 15.
  let rarity = "";
  if (i === 0) {
    rarity = "Ultra Rare";
  } else if (i < 5) {
    rarity = "Rare";
  } else if (i < 10) {
    rarity = "Uncommon";
  } else {
    rarity = "Common";
  }

  const metadata = {
    name: `Chest #${i}`,
    description: `A unique chest from the Game of Death. Frame ${i}.`,
    image: `ipfs://${ipfsFolderHash}/frame${i}.png`,
    attributes: [
      {
        trait_type: "Rarity",
        value: rarity
      },
      {
        trait_type: "Frame Index",
        value: i
      }
    ]
  };

  const filePath = path.join(metadataDir, `${i}.json`);
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  console.log(`Generated ${filePath}`);
}

console.log("All 16 JSON metadata files generated successfully.");
