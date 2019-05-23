import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Docs } from '../client/documents/Documents';
import { RouteStore } from '../server/RouteStore';
import "./ImageUpload.scss";
import React = require('react');
import { DocServer } from '../client/DocServer';
import { Opt, Doc } from '../new_fields/Doc';
import { Cast } from '../new_fields/Types';
import { listSpec } from '../new_fields/Schema';
import { List } from '../new_fields/List';




// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }
const inputRef = React.createRef<HTMLInputElement>();

const onClick = async () => {
    await Docs.initProtos();
    let imgPrev = document.getElementById("img_preview");
    if (imgPrev) {
        let files: FileList | null = inputRef.current!.files;
        if (files && files.length !== 0) {
            console.log(files[0]);
            const name = files[0].name;
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
                var doc = Docs.ImageDocument(path, { nativeWidth: 200, width: 200, title: name });

                const res = await rp.get(DocServer.prepend(RouteStore.getUserDocumentId));
                if (!res) {
                    throw new Error("No user id returned");
                }
                const field = await DocServer.GetRefField(res);
                let pending: Opt<Doc>;
                if (field instanceof Doc) {
                    pending = await Cast(field.optionalRightCollection, Doc);
                }
                if (pending) {
                    const data = await Cast(pending.data, listSpec(Doc));
                    if (data) {
                        data.push(doc);
                    } else {
                        pending.data = new List([doc]);
                    }
                }
            });

            // console.log(window.location.origin + file[0])

            //imgPrev.setAttribute("src", window.location.origin + files[0].name)
        }
    }
};

ReactDOM.render((
    <div className="imgupload_cont">
        {/* <button className = "button_file"  = {onPointerDown}> Open Image </button> */}
        <label htmlFor="input_image_file" className="upload_label">Choose an Image</label>
        <input type="file" accept="image/*" className="input_file" id="input_image_file" ref={inputRef}></input>
        <button onClick={onClick} className="upload_button">Upload</button>
        <img id="img_preview" src=""></img>
        <div id="message" />
    </div>),
    document.getElementById('root')
);