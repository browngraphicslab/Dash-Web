import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Documents } from '../client/documents/Documents';
import { Server } from '../client/Server';
import { Document } from '../fields/Document';
import { KeyStore } from '../fields/KeyStore';
import { ListField } from '../fields/ListField';
import { RouteStore } from '../server/RouteStore';
import { ServerUtils } from '../server/ServerUtil';
import "./ImageUpload.scss";
import React = require('react');




// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }

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
                    var doc: Document = Documents.ImageDocument(path, { nativeWidth: 200, width: 200 })

                    rp.get(ServerUtils.prepend(RouteStore.getUserDocumentId)).then(res => {
                        if (res) {
                            return Server.GetField(res);
                        }
                        throw new Error("No user id returned");
                    }).then(field => {
                        if (field instanceof Document) {
                            return field.GetTAsync(KeyStore.OptionalRightCollection, Document)
                        }
                    }).then(pending => {
                        if (pending) {
                            pending.GetOrCreateAsync(KeyStore.Data, ListField, list => {
                                list.Data.push(doc);
                            })
                        }
                    });

                    // console.log(window.location.origin + file[0])

                    //imgPrev.setAttribute("src", window.location.origin + files[0].name)
                })
            })
        }
    }
}

ReactDOM.render((
    <div className="imgupload_cont">
        {/* <button className = "button_file"  = {onPointerDown}> Open Image </button> */}
        <input type="file" accept="image/*" onChange={onFileLoad} className="input_file" id="input_image_file"></input>
        <img id="img_preview" src=""></img>
        <div id="message" />
    </div>),
    document.getElementById('root')
);