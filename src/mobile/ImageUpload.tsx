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
import MainViewModal from '../client/views/MainViewModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { MobileInterface } from './MobileInterface';

export interface ImageUploadProps {
    Document: Doc; // Target document for upload (upload location)
}

const inputRef = React.createRef<HTMLInputElement>();

@observer
export class Uploader extends React.Component<ImageUploadProps> {
    @observable error: string = "";
    @observable nm: string = "Choose files"; // Text of 'Choose Files' button
    @observable process: string = ""; // Current status of upload

    onClick = async () => {
        try {
            const col = this.props.Document;
            await Docs.Prototypes.initialize();
            const imgPrev = document.getElementById("img_preview");
            this.setOpacity(1, "1"); // Slab 1
            if (imgPrev) {
                const files: FileList | null = inputRef.current!.files;
                this.setOpacity(2, "1"); // Slab 2
                if (files && files.length !== 0) {
                    this.process = "Uploading Files";
                    for (let index = 0; index < files.length; ++index) {
                        const file = files[index];
                        const res = await Networking.UploadFilesToServer(file);
                        this.setOpacity(3, "1"); // Slab 3
                        // For each item that the user has selected
                        res.map(async ({ result }) => {
                            const name = file.name;
                            if (result instanceof Error) {
                                return;
                            }
                            const path = Utils.prepend(result.accessPaths.agnostic.client);
                            let doc = null;
                            // Case 1: File is a video
                            if (file.type === "video/mp4") {
                                doc = Docs.Create.VideoDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                                // Case 2: File is a PDF document
                            } else if (file.type === "application/pdf") {
                                doc = Docs.Create.PdfDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                                // Case 3: File is another document type (most likely Image)
                            } else {
                                doc = Docs.Create.ImageDocument(path, { _nativeWidth: 400, _width: 400, title: name });
                            }
                            this.setOpacity(4, "1"); // Slab 4
                            const res = await rp.get(Utils.prepend("/getUserDocumentId"));
                            if (!res) {
                                throw new Error("No user id returned");
                            }
                            const field = await DocServer.GetRefField(res);
                            let pending: Opt<Doc>;
                            if (field instanceof Doc) {
                                pending = col;
                            }
                            if (pending) {
                                const data = await Cast(pending.data, listSpec(Doc));
                                if (data) data.push(doc);
                                else pending.data = new List([doc]);
                                this.setOpacity(5, "1"); // Slab 5
                                this.process = "File " + (index + 1).toString() + " Uploaded";
                                this.setOpacity(6, "1"); // Slab 6
                            }
                            if ((index + 1) === files.length) {
                                this.process = "Uploads Completed";
                                this.setOpacity(7, "1"); // Slab 7
                            }
                        });
                    }
                    // Case in which the user pressed upload and no files were selected
                } else {
                    this.process = "No file selected";
                }
                // Three seconds after upload the menu will reset
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
            this.nm = files[0].name;
        } else if (files && files.length > 1) {
            this.nm = files.length.toString() + " files selected";
        }
    }

    // Loops through load icons, and resets buttons
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
    }

    // Clears the upload and closes the upload menu
    closeUpload = () => {
        this.clearUpload();
        MobileInterface.Instance.toggleUpload();
    }

    // Handles the setting of the loading bar
    setOpacity = (index: number, opacity: string) => {
        const slab = document.getElementById("slab" + index);
        if (slab) slab.style.opacity = opacity;
    }

    // Returns the upload interface for mobile
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
