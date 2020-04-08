import { Database } from "./database";

const protos =
    ["text", "image", "web", "collection", "kvp", "video", "audio", "pdf", "icon", "import", "linkdoc"];

(async function () {
    await Promise.all(
        protos.map(protoId => new Promise(res => Database.Instance.update(protoId, {
            $set: { "fields.baseProto": true }
        }, res)))
    );

    console.log("done");
})();