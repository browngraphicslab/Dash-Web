import * as ReactDOM from 'react-dom';
import React = require('react');
import "./ImageUpload.scss"
import { action, runInAction } from "mobx";
import { type } from 'os';
import { Documents } from '../client/documents/Documents';
import { Document } from '../fields/Document';
import { Server } from '../client/Server';
import { Opt, Field } from '../fields/Field';
import { ListField } from '../fields/ListField';
import { KeyStore } from '../fields/KeyStore';




// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }
const pendingDocId = "pending-doc"

const onFileLoad = (file: any) => {
    let imgPrev = document.getElementById("img_preview")
    if (imgPrev) {
        let files: File[] = file.target.files;
        if (files.length != 0) {
            console.log(files[0]);
            let formData = new FormData();
            formData.append("file", files[0]);

            const upload = window.location.origin + "/upload"
            fetch(upload, {
                method: 'POST',
                body: formData
            }).then((res: Response) => {
                return res.json()
            }).then(json => {
                json.map((file: any) => {
                    let path = window.location.origin + file
                    runInAction(() => {
                        var doc: Document = Documents.ImageDocument(path, { nativeWidth: 200, width: 200 })
                        Server.GetField(pendingDocId, (res: Opt<Field>) => {
                            if (res) {
                                if (res instanceof Document) {
                                    res.GetOrCreateAsync(KeyStore.Data, ListField, (f: ListField<Document>) => {
                                        f.Data.push(doc)
                                    })
                                }
                            }
                        })
                    })
                })
            })
            // console.log(window.location.origin + file[0])

            //imgPrev.setAttribute("src", window.location.origin + files[0].name)
        }
    }


}

ReactDOM.render((
    <div className="imgupload_cont">
        {/* <button className = "button_file"  = {onPointerDown}> Open Image </button> */}
        <input type="file" accept="image/*" onChange={onFileLoad} className="input_file" id="input_image_file"></input>
        <img id="img_preview" src=""></img>
    </div>),
    document.getElementById('root')
);