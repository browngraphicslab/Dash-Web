import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { KeyStore } from '../fields/KeyStore';
import { Documents } from '../client/documents/Documents';
import { Server } from '../client/Server';
import { Document } from '../fields/Document';
import { ListField } from '../fields/ListField';
import { RouteStore } from '../server/RouteStore';
import { ServerUtils } from '../server/ServerUtil';
import "./ImageUpload.scss";
import React = require('react');
import { Opt } from '../fields/Field';




// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }

const onFileLoad = async (file: any) => {
    let imgPrev = document.getElementById("img_preview");
    if (imgPrev) {
        let files: File[] = file.target.files;
        if (files.length !== 0) {
            console.log(files[0]);
            let formData = new FormData();
            formData.append("file", files[0]);

            const upload = window.location.origin + "/upload";
            const res = await fetch(upload, {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            json.map(async (file: any) => {
                let path = window.location.origin + file;
                var doc: Document = Documents.ImageDocument(path, { nativeWidth: 200, width: 200 });

                const res = await rp.get(ServerUtils.prepend(RouteStore.getUserDocumentId));
                if (!res) {
                    throw new Error("No user id returned");
                }
                const field = await Server.GetField(res);
                let pending: Opt<Document>;
                if (field instanceof Document) {
                    pending = await field.GetTAsync(KeyStore.OptionalRightCollection, Document);
                }
                if (pending) {
                    pending.GetOrCreateAsync(KeyStore.Data, ListField, list => {
                        list.Data.push(doc);
                    });
                }
            });

            // console.log(window.location.origin + file[0])

            //imgPrev.setAttribute("src", window.location.origin + files[0].name)
        }
    }
};

(async () => {
    await Documents.initProtos();
    ReactDOM.render((
        <div className="imgupload_cont">
            {/* <button className = "button_file"  = {onPointerDown}> Open Image </button> */}
            <label for="input_image_file" class="upload_label">Upload an Image</label>
            <input type="file" accept="image/*" onChange={onFileLoad} className="input_file" id="input_image_file"></input>
            <img id="img_preview" src=""></img>
            <div id="message" />
        </div>),
        document.getElementById('root')
    );
})();


// ReactDOM.render((
//     <div className="imgupload_cont">
//         {/* <button className = "button_file"  = {onPointerDown}> Open Image </button> */}
//         <input type="file" accept="image/*" onChange={onFileLoad} className="input_file" id="input_image_file"></input>
//         <img id="img_preview" src=""></img>
//         <div id="message" />
//     </div>),
//     document.getElementById('root')
// );