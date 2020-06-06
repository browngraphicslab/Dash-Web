import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Docs } from '../client/documents/Documents';
import "./ImageUpload.scss";
import React = require('react');
import { DocServer } from '../client/DocServer';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import { Utils } from '../Utils';
import { Networking } from '../client/Network';
import { Doc, Opt } from '../fields/Doc';
import { Cast } from '../fields/Types';
import { listSpec } from '../fields/Schema';
import { List } from '../fields/List';

export interface ImageUploadProps {
    Document: Doc;
}

// const onPointerDown = (e: React.TouchEvent) => {
//     let imgInput = document.getElementById("input_image_file");
//     if (imgInput) {
//         imgInput.click();
//     }
// }
const inputRef = React.createRef<HTMLInputElement>();

@observer
export class Uploader extends React.Component<ImageUploadProps> {
    @observable error: string = "";
    @observable status: string = "";

    onClick = async () => {
        console.log("uploader click");
        try {
            this.status = "initializing protos";
            await Docs.Prototypes.initialize();
            const imgPrev = document.getElementById("img_preview");
            if (imgPrev) {
                const files: FileList | null = inputRef.current!.files;
                if (files && files.length !== 0) {
                    console.log(files[0]);
                    const name = files[0].name;
                    const res = await Networking.UploadFilesToServer(files[0]);
                    this.status = "uploading image";
                    this.status = "upload image, getting json";

                    res.map(async ({ result }) => {
                        if (result instanceof Error) {
                            return;
                        }
                        const path = Utils.prepend(result.accessPaths.agnostic.client);
                        const doc = Docs.Create.ImageDocument(path, { _nativeWidth: 200, _width: 200, title: name });

                        this.status = "getting user document";

                        const res = await rp.get(Utils.prepend("/getUserDocumentId"));
                        if (!res) {
                            throw new Error("No user id returned");
                        }
                        const field = await DocServer.GetRefField(res);
                        let pending: Opt<Doc>;
                        if (field instanceof Doc) {
                            pending = await Cast(field.rightSidebarCollection, Doc);
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
                            console.log("hi");
                        }

                    });
                }
            }
        } catch (error) {
            this.error = JSON.stringify(error);
        }
    }

    render() {
        return (
            <div className="imgupload_cont">
                <label htmlFor="input_image_file" className="upload_label" onClick={this.onClick}>Upload Image</label>
                <input type="file" accept="image/*" className="input_file" id="input_image_file" ref={inputRef}></input>
                {/* <div onClick={this.onClick} className="upload_button">Upload</div> */}
                <img id="img_preview" src=""></img>
                {/* <p>{this.status}</p>
                <p>{this.error}</p> */}
            </div>
        );
    }

}


// DocServer.init(window.location.protocol, window.location.hostname, 4321, "image upload");
