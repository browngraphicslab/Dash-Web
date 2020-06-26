import * as ReactDOM from 'react-dom';
import * as rp from 'request-promise';
import { Docs } from '../client/documents/Documents';
import "./ImageUpload.scss";
import React = require('react');
import { DocServer } from '../client/DocServer';
import { observer } from 'mobx-react';
import { observable, action, computed } from 'mobx';
import { Utils, emptyPath, returnFalse, emptyFunction, returnOne, returnZero, returnTrue, returnEmptyFilter } from '../Utils';
import { Networking } from '../client/Network';
import { Doc, Opt } from '../fields/Doc';
import { Cast, FieldValue } from '../fields/Types';
import { listSpec } from '../fields/Schema';
import { List } from '../fields/List';
import { Scripting } from '../client/util/Scripting';
import MainViewModal from '../client/views/MainViewModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { nullAudio } from '../fields/URLField';
import { Transform } from '../client/util/Transform';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { MobileInterface } from './MobileInterface';
import { DictationOverlay } from '../client/views/DictationOverlay';
import RichTextMenu from '../client/views/nodes/formattedText/RichTextMenu';
import { ContextMenu } from '../client/views/ContextMenu';

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
export class AudioUpload extends React.Component {
    @observable error: string = "";
    @observable status: string = "";
    @observable nm: string = "Choose files";
    @observable process: string = "";
    @observable public _audioCol: Doc = FieldValue(Cast(Docs.Create.FreeformDocument([Cast(Docs.Create.AudioDocument(nullAudio, { title: "mobile audio", _width: 500, _height: 100 }), Doc) as Doc], { title: "mobile audio", _fitToBox: true, boxShadow: "0 0" }), Doc)) as Doc;


    @action
    clearUpload = () => {
        for (let i = 1; i < 8; i++) {
            this.setOpacity(i, "0.2");
        }
        this._audioCol = FieldValue(Cast(Docs.Create.FreeformDocument([Cast(Docs.Create.AudioDocument(nullAudio, { title: "mobile audio", _width: 500, _height: 100 }), Doc) as Doc], { title: "mobile audio", _fitToBox: true, boxShadow: "0 0" }), Doc)) as Doc;
    }

    closeUpload = () => {
        this.clearUpload();
        MobileInterface.Instance.toggleAudio();
    }

    private get uploadInterface() {
        return (
            <>
                <ContextMenu />
                <DictationOverlay />
                <div style={{ display: "none" }}><RichTextMenu key="rich" /></div>
                <div className="closeUpload" onClick={() => this.closeUpload()}>
                    <FontAwesomeIcon icon="window-close" size={"lg"} />
                </div>
                <FontAwesomeIcon icon="microphone" size="lg" style={{ fontSize: "130" }} />
                <div className="audioUpload_cont">
                    <DocumentView
                        Document={this._audioCol}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        addDocument={undefined}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        rootSelected={returnTrue}
                        removeDocument={undefined}
                        docFilters={returnEmptyFilter}
                        onClick={undefined}
                        ScreenToLocalTransform={Transform.Identity}
                        ContentScaling={returnOne}
                        PanelWidth={() => 600}
                        PanelHeight={() => 400}
                        NativeHeight={returnZero}
                        NativeWidth={returnZero}
                        renderDepth={0}
                        focus={emptyFunction}
                        backgroundColor={() => "rgba(0,0,0,0)"}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                    />
                </div>
                <div className="restart_label" onClick={this.clearUpload}>
                    Restart
                </div>
                <div className="upload_label" onClick={this.uploadAudio}>
                    Upload
                </div>
                <div className="loadingImage">
                    <div className="loadingSlab" id="slab01" />
                    <div className="loadingSlab" id="slab02" />
                    <div className="loadingSlab" id="slab03" />
                    <div className="loadingSlab" id="slab04" />
                    <div className="loadingSlab" id="slab05" />
                    <div className="loadingSlab" id="slab06" />
                    <div className="loadingSlab" id="slab07" />
                </div>
            </>
        );
    }

    setOpacity = (i: number, o: string) => {
        const slab = document.getElementById("slab0" + i);
        if (slab) {
            console.log(slab?.id);
            slab.style.opacity = o;
        }
    }

    // Pushing the audio doc onto Dash Web through the right side bar
    uploadAudio = () => {
        console.log("uploading");
        const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
        const audioDoc = this._audioCol;
        const data = Cast(audioRightSidebar.data, listSpec(Doc));
        for (let i = 1; i < 8; i++) {
            setTimeout(() => this.setOpacity(i, "1"), i * 200);
        }
        if (data) {
            data.push(audioDoc);
        }

        setTimeout(this.clearUpload, 3000);
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


