import * as taglib from 'node-taglib-sharp';

const filePath = String.raw`C:\Users\nknmr26\Downloads\Nora-4.0.0-alpha.4\Nora-4.0.0-alpha.4\test song\01 - ULTRA SUNN - Keep Your Eyes Peeled.flac`;

try {
    const file = taglib.File.createFromPath(filePath);
    console.log("File opened successfully!");
    console.log("Pictures count:", file.tag.pictures.length);
    
    let needsSave = false;
    for (const pic of file.tag.pictures) {
        console.log("Pic mime:", pic.mimeType);
        if (!pic.mimeType || pic.mimeType === "") {
            console.log("Found empty mime type! Setting to image/jpeg...");
            pic.mimeType = "image/jpeg";
            needsSave = true;
        }
    }
    
    if (needsSave) {
        file.save();
        console.log("File saved!");
    } else {
        console.log("No changes needed.");
    }
    
    file.dispose();
} catch (e) {
    console.error("Error:", e);
}
