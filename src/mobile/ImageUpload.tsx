import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Docs } from '../client/documents/Documents';
import "./ImageUpload.scss";
import React = require('react');
import { DocServer } from '../client/DocServer';
import { Opt, Doc } from '../new_fields/Doc';
import { Cast } from '../new_fields/Types';
import { listSpec } from '../new_fields/Schema';
import { List } from '../new_fields/List';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import { Utils } from '../Utils';




// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }
const inputRef = React.createRef<HTMLInputElement>();

@observer
class Uploader extends React.Component {
    @observable
    error: string = "";
    @observable
    status: string = "";

    onClick = async () => {
        try {
            this.status = "initializing protos";
            await Docs.Prototypes.initialize();
            let imgPrev = document.getElementById("img_preview");
            if (imgPrev) {
                let files: FileList | null = inputRef.current!.files;
                if (files && files.length !== 0) {
                    console.log(files[0]);
                    const name = files[0].name;
                    let formData = new FormData();
                    formData.append("file", files[0]);

                    const upload = window.location.origin + "/upload";
                    this.status = "uploading image";
                    const res = await fetch(upload, {
                        method: 'POST',
                        body: formData
                    });
                    this.status = "upload image, getting json";
                    const json = await res.json();
                    json.map(async (file: any) => {
                        let path = window.location.origin + file;
                        var doc = Docs.Create.ImageDocument(path, { nativeWidth: 200, width: 200, title: name });

                        this.status = "getting user document";

                        const res = await rp.get(Utils.prepend("/getUserDocumentId"));
                        if (!res) {
                            throw new Error("No user id returned");
                        }
                        const field = await DocServer.GetRefField(res);
                        let pending: Opt<Doc>;
                        if (field instanceof Doc) {
                            pending = await Cast(field.optionalRightCollection, Doc);
                        }
                        if (pending) {
                            this.status = "has pending docs";
                            const data = await Cast(pending.data, listSpec(Doc));
                            if (data) {
                                data.push(doc);
                            } else {
                                pending.data = new List([doc]);
                            }
                            this.status = "finished";
                        }
                    });

                    // console.log(window.location.origin + file[0])

                    //imgPrev.setAttribute("src", window.location.origin + files[0].name)
                }
            }
        } catch (error) {
            this.error = JSON.stringify(error);
        }
    }

    render() {
        return (
            <div className="imgupload_cont">
                <label htmlFor="input_image_file" className="upload_label">Choose an Image</label>
                <input type="file" accept="image/*" className="input_file" id="input_image_file" ref={inputRef}></input>
                <button onClick={this.onClick} className="upload_button">Upload</button>
                <img id="img_preview" src=""></img>
                <p>{this.status}</p>
                <p>{this.error}</p>
            </div>
        );
    }

}


DocServer.init(window.location.protocol, window.location.hostname, 4321, "image upload");

ReactDOM.render((
    <Uploader />
),
    document.getElementById('root')
);