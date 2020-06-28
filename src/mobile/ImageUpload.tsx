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
import { MobileInterface } from './MobileInterface';
import { CurrentUserUtils } from '../client/util/CurrentUserUtils';

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
    @observable nm: string = "Choose files";
    @observable process: string = "";

    onClick = async () => {
        try {
            const col = this.props.Document;
            await Docs.Prototypes.initialize();
            const imgPrev = document.getElementById("img_preview");
            // Slab 1
            this.setOpacity(1, "1");
            if (imgPrev) {
                const files: FileList | null = inputRef.current!.files;
                // Slab 2
                this.setOpacity(2, "1");
                if (files && files.length !== 0) {
                    this.process = "Uploading Files";
                    for (let index = 0; index < files.length; ++index) {
                        const file = files[index];
                        const res = await Networking.UploadFilesToServer(file);
                        // Slab 3
                        this.setOpacity(3, "1");
                        res.map(async ({ result }) => {
                            const name = file.name;
                            if (result instanceof Error) {
                                return;
                            }
                            const path = Utils.prepend(result.accessPaths.agnostic.client);
                            let doc = null;
                            console.log("type: " + file.type);
                            if (file.type === "video/mp4") {
                                doc = Docs.Create.VideoDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                            } else if (file.type === "application/pdf") {
                                doc = Docs.Create.PdfDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                            } else {
                                doc = Docs.Create.ImageDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                            }
                            // Slab 4
                            this.setOpacity(4, "1");
                            const res = await rp.get(Utils.prepend("/getUserDocumentId"));
                            if (!res) {
                                throw new Error("No user id returned");
                            }
                            const field = await DocServer.GetRefField(res);
                            let pending: Opt<Doc>;
                            if (field instanceof Doc) {
                                // if (col === Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc) {
                                //     pending = await Cast(field.rightSidebarCollection, Doc);
                                // }
                                pending = col;
                                //pending = await Cast(field.col, Doc);
                            }
                            if (pending) {
                                const data = await Cast(pending.data, listSpec(Doc));
                                if (data) data.push(doc);
                                else pending.data = new List([doc]);
                                this.status = "finished";
                                this.setOpacity(5, "1"); // Slab 5
                                this.process = "File " + (index + 1).toString() + " Uploaded";
                                this.setOpacity(6, "1"); // Slab 6
                                this.setOpacity(7, "1"); // Slab 7
                            }
                            console.log("i: " + index + 1);
                            console.log("l: " + files.length);
                            if ((index + 1) === files.length) {
                                this.process = "Uploads Completed";
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
        for (let i = 1; i < 8; i++) {
            this.setOpacity(i, "0.2");
        }
        this.nm = "Choose files";

        if (inputRef.current) {
            inputRef.current.value = "";
        }
        this.process = "";
        console.log(inputRef.current!.files);
    }

    closeUpload = () => {
        this.clearUpload();
        MobileInterface.Instance.toggleUpload();
    }

    setOpacity = (i: number, o: string) => {
        const slab = document.getElementById("slab" + i);
        if (slab) {
            console.log(slab?.id);
            slab.style.opacity = o;
        }
    }


    private get uploadInterface() {
        return (
            <div className="imgupload_cont">
                <div className="closeUpload" onClick={() => this.closeUpload()}>
                    <FontAwesomeIcon icon="window-close" size={"lg"} />
                </div>
                <FontAwesomeIcon icon="upload" size="lg" style={{ fontSize: "130" }} />
                <input type="file" accept="application/pdf, video/*,image/*" className={`inputFile ${this.nm !== "Choose files" ? "active" : ""}`} id="input_image_file" ref={inputRef} onChange={this.inputLabel} multiple></input>
                <label className="file" id="label" htmlFor="input_image_file">{this.nm}</label>
                <div className="upload_label" onClick={this.onClick}>
                    Upload
                </div>
                <img id="img_preview" src=""></img>
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
