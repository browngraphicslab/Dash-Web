import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Docs } from '../client/documents/Documents';
import { Transform } from '../client/util/Transform';
import { ContextMenu } from '../client/views/ContextMenu';
import { DictationOverlay } from '../client/views/DictationOverlay';
import { MainViewModal } from '../client/views/MainViewModal';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { RichTextMenu } from '../client/views/nodes/formattedText/RichTextMenu';
import { Doc } from '../fields/Doc';
import { listSpec } from '../fields/Schema';
import { Cast, FieldValue } from '../fields/Types';
import { nullAudio } from '../fields/URLField';
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue, emptyPath } from '../Utils';
import "./ImageUpload.scss";
import { MobileInterface } from './MobileInterface';
import React = require('react');

@observer
export class AudioUpload extends React.Component {
    @observable public _audioCol: Doc = FieldValue(Cast(Docs.Create.FreeformDocument([Cast(Docs.Create.AudioDocument(nullAudio, { title: "mobile audio", _width: 500, _height: 100 }), Doc) as Doc], { title: "mobile audio", _width: 300, _height: 300, _fitToBox: true, boxShadow: "0 0" }), Doc)) as Doc;

    /**
     * Handles the onclick functionality for the 'Restart' button
     * Resets the document to its default view
     */
    @action
    clearUpload = () => {
        for (let i = 1; i < 8; i++) {
            this.setOpacity(i, "0.2");
        }
        this._audioCol = FieldValue(Cast(
            Docs.Create.FreeformDocument(
                [Cast(Docs.Create.AudioDocument(nullAudio, {
                    title: "mobile audio",
                    _width: 500,
                    _height: 100
                }), Doc) as Doc], { title: "mobile audio", _width: 300, _height: 300, _fitToBox: true, boxShadow: "0 0" }), Doc)) as Doc;
    }

    /** 
     * Handles the onClick of the 'Close' button
     * Reset upload interface and toggle audio
     */
    closeUpload = () => {
        this.clearUpload();
        MobileInterface.Instance.toggleAudio();
    }

    /**
     * Handles the on click of the 'Upload' button.
     * Pushing the audio doc onto Dash Web through the right side bar
     */
    uploadAudio = () => {
        const audioRightSidebar = Cast(Doc.SharingDoc(), Doc, null);
        const audioDoc = this._audioCol;
        const data = Cast(audioRightSidebar.data, listSpec(Doc));
        for (let i = 1; i < 8; i++) {
            setTimeout(() => this.setOpacity(i, "1"), i * 200);
        }
        if (data) {
            data.push(audioDoc);
        }
        // Resets uploader after 3 seconds
        setTimeout(this.clearUpload, 3000);
    }

    // Returns the upload audio menu
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
                        addDocument={undefined}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        rootSelected={returnTrue}
                        removeDocument={undefined}
                        docFilters={returnEmptyFilter}
                        docRangeFilters={returnEmptyFilter}
                        searchFilterDocs={returnEmptyDoclist}
                        ScreenToLocalTransform={Transform.Identity}
                        PanelWidth={() => 600}
                        PanelHeight={() => 400}
                        renderDepth={0}
                        isDocumentActive={returnTrue}
                        isContentActive={returnFalse}
                        focus={emptyFunction}
                        layerProvider={undefined}
                        styleProvider={() => "rgba(0,0,0,0)"}
                        docViewPath={returnEmptyDoclist}
                        whenChildContentsActiveChanged={emptyFunction}
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

    // Handles the setting of the loading bar
    setOpacity = (index: number, opacity: string) => {
        const slab = document.getElementById("slab0" + index);
        if (slab) {
            slab.style.opacity = opacity;
        }
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
                closeOnExternalClick={this.closeUpload}
            />
        );
    }

}


