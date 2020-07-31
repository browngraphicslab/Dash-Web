import * as fs from 'fs';
import * as sharp from 'sharp';

const folder = "./src/server/public/files/";
const pngTypes = ["png", "PNG"];
const jpgTypes = ["jpg", "JPG", "jpeg", "JPEG"];
const smallResizer = sharp().resize(100);
fs.readdir(folder, async (err, files) => {
    if (err) {
        console.log("readdir:" + err);
        return;
    }
    // files.forEach(file => {
    //     if (file.includes("_s") || file.includes("_m") || file.includes("_l")) {
    //         fs.unlink(folder + file, () => { });
    //     }
    // });
    for (const file of files) {
        const filesplit = file.split(".");
        const resizers = [
            { resizer: sharp().resize(100, undefined, { withoutEnlargement: true }), suffix: "_s" },
            { resizer: sharp().resize(400, undefined, { withoutEnlargement: true }), suffix: "_m" },
            { resizer: sharp().resize(900, undefined, { withoutEnlargement: true }), suffix: "_l" },
        ];
        if (pngTypes.some(type => file.endsWith(type))) {
            resizers.forEach(element => {
                element.resizer = element.resizer.png();
            });
        } else if (jpgTypes.some(type => file.endsWith(type))) {
            resizers.forEach(element => {
                element.resizer = element.resizer.jpeg();
            });
        } else {
            continue;
        }
        resizers.forEach(resizer => {
            fs.createReadStream(folder + file).pipe(resizer.resizer).pipe(fs.createWriteStream(folder + filesplit[0] + resizer.suffix + "." + filesplit[1]));
        });
    }
});