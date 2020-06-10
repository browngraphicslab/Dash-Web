import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Docs } from '../client/documents/Documents';
import "./ImageUpload.scss";
import React = require('react');
import { DocServer } from '../client/DocServer';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { Utils } from '../Utils';
import { Networking } from '../client/Network';
import { Doc, Opt } from '../fields/Doc';
import { Cast } from '../fields/Types';
import { listSpec } from '../fields/Schema';
import { List } from '../fields/List';
import { Scripting } from '../client/util/Scripting';
import MainViewModal from '../client/views/MainViewModal';

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
export class Uploader extends React.Component {
    @observable error: string = "";
    @observable status: string = "";
    @observable nm: string = "Choose an image";

    onClick = async () => {
        console.log("uploader click");
        try {
            this.status = "initializing protos";
            const slab1 = document.getElementById("slab1");
            if (slab1) {
                slab1.style.opacity = "1";
            }
            await Docs.Prototypes.initialize();
            const imgPrev = document.getElementById("img_preview");
            console.log("buddy");
            if (imgPrev) {
                console.log("hi");
                const files: FileList | null = inputRef.current!.files;
                if (files && files.length !== 0) {
                    console.log(files[0]);
                    const name = files[0].name;
                    const res = await Networking.UploadFilesToServer(files[0]);
                    this.status = "uploading image";
                    const slab2 = document.getElementById("slab2");
                    if (slab2) {
                        slab2.style.opacity = "1";
                    }
                    this.status = "upload image, getting json";
                    const slab3 = document.getElementById("slab3");
                    if (slab3) {
                        slab3.style.opacity = "1";
                    }
                    res.map(async ({ result }) => {
                        if (result instanceof Error) {
                            return;
                        }
                        const path = Utils.prepend(result.accessPaths.agnostic.client);
                        const doc = Docs.Create.ImageDocument(path, { _nativeWidth: 200, _width: 200, title: name });

                        this.status = "getting user document";
                        const slab4 = document.getElementById("slab4");
                        if (slab4) {
                            slab4.style.opacity = "1";
                        }
                        this.status = "upload image, getting json";
                        const slab5 = document.getElementById("slab5");
                        if (slab5) {
                            slab5.style.opacity = "1";
                        }
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
                            const slab6 = document.getElementById("slab6");
                            if (slab6) {
                                slab6.style.opacity = "1";
                            }
                            const data = await Cast(pending.data, listSpec(Doc));
                            if (data) {
                                data.push(doc);
                            } else {
                                pending.data = new List([doc]);
                            }
                            this.status = "finished";
                            console.log("hi");
                            const slab7 = document.getElementById("slab7");
                            if (slab7) {
                                slab7.style.opacity = "1";
                            }

                        }

                    });
                }
                setTimeout(this.clearUpload, 3000);
            }
        } catch (error) {
            this.error = JSON.stringify(error);
        }

    }

    // Updates label after a files is selected (so user knows a file is uploaded)
    inputLabel = async () => {
        const files: FileList | null = inputRef.current!.files;
        await files;
        if (files && files.length !== 0) {
            console.log(files);
            this.nm = files[0].name;
        }
    }

    @action
    clearUpload = () => {
        const slab1 = document.getElementById("slab1");
        if (slab1) {
            slab1.style.opacity = "0.4";
        }
        const slab2 = document.getElementById("slab2");
        if (slab2) {
            slab2.style.opacity = "0.4";
        }
        const slab3 = document.getElementById("slab3");
        if (slab3) {
            slab3.style.opacity = "0.4";
        }
        const slab4 = document.getElementById("slab4");
        if (slab4) {
            slab4.style.opacity = "0.4";
        }
        const slab5 = document.getElementById("slab5");
        if (slab5) {
            slab5.style.opacity = "0.4";
        }
        const slab6 = document.getElementById("slab6");
        if (slab6) {
            slab6.style.opacity = "0.4";
        }
        const slab7 = document.getElementById("slab7");
        if (slab7) {
            slab7.style.opacity = "0.4";
        }
        this.nm = "Choose an image";

        if (inputRef.current) {
            inputRef.current.value = "";
        }
        console.log(inputRef.current!.files);
    }



    private get uploadInterface() {
        return (
            <div className="imgupload_cont">
                <input type="file" accept="image/*" className="inputFile" id="input_image_file" ref={inputRef} onChange={this.inputLabel}></input>
                <label id="label" htmlFor="input_image_file">{this.nm}</label>
                <div className="upload_label" onClick={this.onClick}>Upload Image</div>
                {/* <div onClick={this.onClick} className="upload_button">Upload</div> */}
                <img id="img_preview" src=""></img>
                {/* <p>{this.status}</p>
                <p>{this.error}</p> */}
                <div className="loadingImage">
                    <div className="loadingSlab" id="slab1" />
                    <div className="loadingSlab" id="slab2" />
                    <div className="loadingSlab" id="slab3" />
                    <div className="loadingSlab" id="slab4" />
                    <div className="loadingSlab" id="slab5" />
                    <div className="loadingSlab" id="slab6" />
                    <div className="loadingSlab" id="slab7" />
                </div>
            </div>
        );
    }

    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

    render() {
        return (
            <MainViewModal
                contents={this.uploadInterface}
                isDisplayed={true}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}


// DocServer.init(window.location.protocol, window.location.hostname, 4321, "image upload");
