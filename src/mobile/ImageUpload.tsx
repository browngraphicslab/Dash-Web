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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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
    @observable nm: string = "Choose files";
    @observable process: string = "";

    onClick = async () => {
        try {
            await Docs.Prototypes.initialize();
            const imgPrev = document.getElementById("img_preview");
            const slab1 = document.getElementById("slab1");
            if (slab1) {
                slab1.style.opacity = "1";
            }
            if (imgPrev) {
                const files: FileList | null = inputRef.current!.files;
                const slab2 = document.getElementById("slab2");
                if (slab2) {
                    slab2.style.opacity = "1";
                }
                if (files && files.length !== 0) {
                    this.process = "Uploading Files";
                    for (let index = 0; index < files.length; ++index) {
                        const file = files[index];
                        const res = await Networking.UploadFilesToServer(file);
                        const slab3 = document.getElementById("slab3");
                        if (slab3) {
                            slab3.style.opacity = "1";
                        }
                        res.map(async ({ result }) => {
                            const name = file.name;
                            if (result instanceof Error) {
                                return;
                            }
                            const path = Utils.prepend(result.accessPaths.agnostic.client);
                            let doc = null;
                            if (file.type === "video/mp4") {
                                doc = Docs.Create.VideoDocument(path, { _nativeWidth: 200, _width: 200, title: name });
                            } else {
                                doc = Docs.Create.ImageDocument(path, { _nativeWidth: 200, _width: 200, title: name });
                            }
                            const slab4 = document.getElementById("slab4");
                            if (slab4) {
                                slab4.style.opacity = "1";
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
                                const data = await Cast(pending.data, listSpec(Doc));
                                if (data) {
                                    data.push(doc);
                                } else {
                                    pending.data = new List([doc]);
                                }
                                this.status = "finished";
                                const slab5 = document.getElementById("slab5");
                                if (slab5) {
                                    slab5.style.opacity = "1";
                                }
                                this.process = "File " + (index + 1).toString() + " Uploaded";
                                const slab6 = document.getElementById("slab6");
                                if (slab6) {
                                    slab6.style.opacity = "1";
                                }
                                const slab7 = document.getElementById("slab7");
                                if (slab7) {
                                    slab7.style.opacity = "1";
                                }

                            }
                        });
                    }
                } else {
                    this.process = "No file selected";
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
        if (files && files.length === 1) {
            console.log(files);
            this.nm = files[0].name;
        } else if (files && files.length > 1) {
            console.log(files.length);
            this.nm = files.length.toString() + " files selected";
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
        this.nm = "Choose files";

        if (inputRef.current) {
            inputRef.current.value = "";
        }
        this.process = "";
        console.log(inputRef.current!.files);
    }



    private get uploadInterface() {
        return (
            <div className="imgupload_cont">
                <input type="file" accept="video/*,image/*" className="inputFile" id="input_image_file" ref={inputRef} onChange={this.inputLabel} multiple></input>
                <label className="file" id="label" htmlFor="input_image_file">{this.nm}</label>
                <div className="upload_label" onClick={this.onClick}>
                    <FontAwesomeIcon icon="upload" size="sm" />
                    Upload
                </div>
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
                <p className="status">{this.process}</p>
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
