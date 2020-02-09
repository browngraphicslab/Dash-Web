import React = require('react');
import { observer } from 'mobx-react';
import { computed, action, observable } from 'mobx';
import { CurrentUserUtils } from '../server/authentication/models/current_user_utils';
import { FieldValue, Cast, StrCast } from '../new_fields/Types';
import { Doc } from '../new_fields/Doc';
import { Docs } from '../client/documents/Documents';
import { CollectionView } from '../client/views/collections/CollectionView';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { emptyPath, emptyFunction, returnFalse, returnOne, returnEmptyString, returnTrue } from '../Utils';
import { Transform } from '../client/util/Transform';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPenNib, faHighlighter, faEraser, faMousePointer, faBreadSlice, faTrash, faCheck, faLongArrowAltLeft } from '@fortawesome/free-solid-svg-icons';
import { Scripting } from '../client/util/Scripting';
import { CollectionFreeFormView } from '../client/views/collections/collectionFreeForm/CollectionFreeFormView';
import GestureOverlay from '../client/views/GestureOverlay';
import { InkingControl } from '../client/views/InkingControl';
import { InkTool } from '../new_fields/InkField';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import "./MobileInterface.scss";
import { SelectionManager } from '../client/util/SelectionManager';
import { DateField } from '../new_fields/DateField';
import { GestureUtils } from '../pen-gestures/GestureUtils';
import { DocServer } from '../client/DocServer';

library.add(faLongArrowAltLeft);

@observer
export default class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return CurrentUserUtils.UserDocument; }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    // @observable private currentView: "main" | "ink" | "upload" = "main";
    private mainDoc: Doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
    @observable private renderView?: () => JSX.Element;

    // private inkDoc?: Doc;
    public drawingInk: boolean = false;

    // private uploadDoc?: Doc;

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        library.add(...[faPenNib, faHighlighter, faEraser, faMousePointer]);

        if (this.userDoc && !this.mainContainer) {
            // const doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
            this.userDoc.activeMobile = this.mainDoc;
        }
    }

    @action
    switchCurrentView = (doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
        if (!this.userDoc) return;

        this.userDoc.activeMobile = doc(this.userDoc);
        onSwitch && onSwitch();

        this.renderView = renderView;
        console.log("switching current view", renderView);
    }

    onSwitchInking = () => {
        InkingControl.Instance.switchTool(InkTool.Pen);
        MobileInterface.Instance.drawingInk = true;

        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: true,
            width: window.innerWidth,
            height: window.innerHeight
        });
    }

    // @action
    // switchCurrentView = (view: "main" | "ink" | "upload") => {
    //     this.currentView = view;

    //     if (this.userDoc) {
    //         switch (view) {
    //             case "main": {
    //                 // const doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
    //                 this.userDoc.activeMobile = this.mainDoc;
    //                 break;
    //             }
    //             case "ink": {
    //                 this.inkDoc = CurrentUserUtils.setupMobileInkingDoc(this.userDoc);
    //                 this.userDoc.activeMobile = this.inkDoc;
    //                 InkingControl.Instance.switchTool(InkTool.Pen);
    //                 this.drawingInk = true;

    //                 DocServer.Mobile.dispatchOverlayTrigger({
    //                     enableOverlay: true,
    //                     width: window.innerWidth,
    //                     height: window.innerHeight
    //                 });

    //                 break;
    //             }
    //             case "upload": {
    //                 this.uploadDoc = CurrentUserUtils.setupMobileUploadDoc(this.userDoc);
    //                 this.userDoc.activeMobile = this.uploadDoc;

    //             }
    //         }
    //     }
    // }

    renderDefaultContent = () => {
        console.log("rendering default content");
        if (this.mainContainer) {
            return <DocumentView
                Document={this.mainContainer}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={returnFalse}
                addDocTab={returnFalse}
                pinToPres={emptyFunction}
                removeDocument={undefined}
                ruleProvider={undefined}
                onClick={undefined}
                ScreenToLocalTransform={Transform.Identity}
                ContentScaling={returnOne}
                PanelWidth={() => window.screen.width}
                PanelHeight={() => window.screen.height}
                renderDepth={0}
                focus={emptyFunction}
                backgroundColor={returnEmptyString}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                zoomToScale={emptyFunction}
                getScale={returnOne}>
            </DocumentView>;
        }
        return "hello";
    }

    onBack = (e: React.MouseEvent) => {
        this.switchCurrentView((userDoc: Doc) => this.mainDoc);
        InkingControl.Instance.switchTool(InkTool.None); // TODO: switch to previous tool

        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: false,
            width: window.innerWidth,
            height: window.innerHeight
        });

        // this.inkDoc = undefined;
        this.drawingInk = false;
    }

    shiftLeft = (e: React.MouseEvent) => {
        console.log("shift left!");
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: -10
        });
        e.preventDefault();
        e.stopPropagation();
    }

    shiftRight = (e: React.MouseEvent) => {
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: 10
        });
        e.preventDefault();
        e.stopPropagation();
    }

    renderInkingContent = () => {
        console.log("rendering inking content");
        // TODO: support panning and zooming
        // TODO: handle moving of ink strokes
        if (this.mainContainer) {
            return (
                <div className="mobileInterface">
                    <div className="mobileInterface-inkInterfaceButtons">
                        <div className="navButtons">
                            <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing">BACK</button>
                        </div>
                        <div className="inkSettingButtons">
                            <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing"><FontAwesomeIcon icon="long-arrow-alt-left" /></button>
                        </div>
                        <div className="navButtons">
                            <button className="mobileInterface-button" onClick={this.shiftLeft} title="Shift left">left</button>
                            <button className="mobileInterface-button" onClick={this.shiftRight} title="Shift right">right</button>
                        </div>
                    </div>
                    <GestureOverlay>
                        <CollectionView
                            Document={this.mainContainer}
                            DataDoc={undefined}
                            LibraryPath={emptyPath}
                            fieldKey={""}
                            addDocTab={returnFalse}
                            pinToPres={emptyFunction}
                            PanelHeight={() => window.innerHeight}
                            PanelWidth={() => window.innerWidth}
                            focus={emptyFunction}
                            isSelected={returnFalse}
                            select={emptyFunction}
                            active={returnFalse}
                            ContentScaling={returnOne}
                            whenActiveChanged={returnFalse}
                            ScreenToLocalTransform={Transform.Identity}
                            ruleProvider={undefined}
                            renderDepth={0}
                            ContainingCollectionView={undefined}
                            ContainingCollectionDoc={undefined}>
                        </CollectionView>
                    </GestureOverlay>
                </div>
            );
        }
    }

    upload = () => {

    }

    renderUploadContent() {
        if (this.mainContainer) {
            return (
                <div className="mobileInterface">
                    <div className="mobileInterface-inkInterfaceButtons">
                        <div className="navButtons">
                            <button className="mobileInterface-button cancel" onClick={this.onBack} title="Back">BACK</button>
                        </div>
                        <div className="uploadSettings">
                            <button className="mobileInterface-button" onClick={this.upload} title="Shift left">UPLOAD</button>
                        </div>
                    </div>
                    <DocumentView
                        Document={this.mainContainer}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        addDocument={returnFalse}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        removeDocument={undefined}
                        ruleProvider={undefined}
                        onClick={undefined}
                        ScreenToLocalTransform={Transform.Identity}
                        ContentScaling={returnOne}
                        PanelWidth={() => window.screen.width}
                        PanelHeight={() => window.screen.height}
                        renderDepth={0}
                        focus={emptyFunction}
                        backgroundColor={returnEmptyString}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                        zoomToScale={emptyFunction}
                        getScale={returnOne}>
                    </DocumentView>
                </div>
            );
        }
    }

    render() {
        // const content = this.currentView === "main" ? this.mainContent :
        //     this.currentView === "ink" ? this.inkContent :
        //         this.currentView === "upload" ? this.uploadContent : <></>;
        return (
            <div className="mobile-container">
                {this.renderView ? this.renderView() : this.renderDefaultContent()}
            </div>
        );
    }
}

Scripting.addGlobal(function switchMobileView(doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); });
Scripting.addGlobal(function onSwitchMobileInking() { return MobileInterface.Instance.onSwitchInking(); });
Scripting.addGlobal(function renderMobileInking() { return MobileInterface.Instance.renderInkingContent(); });
Scripting.addGlobal(function renderMobileUpload() { return MobileInterface.Instance.renderUploadContent(); });

