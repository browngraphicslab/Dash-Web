import React = require('react');
import { observer } from 'mobx-react';
import { computed, action, observable } from 'mobx';
import { CurrentUserUtils } from '../server/authentication/models/current_user_utils';
import { FieldValue, Cast, StrCast } from '../new_fields/Types';
import { Doc, DocListCast } from '../new_fields/Doc';
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
import { DocumentDecorations } from '../client/views/DocumentDecorations';
import { OverlayView } from '../client/views/OverlayView';
import { DictationOverlay } from '../client/views/DictationOverlay';
import SharingManager from '../client/util/SharingManager';
import { PreviewCursor } from '../client/views/PreviewCursor';
import { ContextMenu } from '../client/views/ContextMenu';
import { RadialMenu } from '../client/views/nodes/RadialMenu';
import PDFMenu from '../client/views/pdf/PDFMenu';
import MarqueeOptionsMenu from '../client/views/collections/collectionFreeForm/MarqueeOptionsMenu';
import GoogleAuthenticationManager from '../client/apis/GoogleAuthenticationManager';
import { listSpec } from '../new_fields/Schema';
import { Id } from '../new_fields/FieldSymbols';
import { DocumentManager } from '../client/util/DocumentManager';
import RichTextMenu from '../client/util/RichTextMenu';
import { WebField } from "../new_fields/URLField";
import { FieldResult } from "../new_fields/Doc";
import { List } from '../new_fields/List';

library.add(faLongArrowAltLeft);

@observer
export default class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return CurrentUserUtils.UserDocument; }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    // @observable private currentView: "main" | "ink" | "upload" = "main";
    private mainDoc: any = CurrentUserUtils.setupMobileDoc(this.userDoc);
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
            this.userDoc.activeMobile = this.mainDoc;
        }
    }

    @action
    switchCurrentView = (doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
        if (!this.userDoc) return;

        this.userDoc.activeMobile = doc(this.userDoc);
        onSwitch && onSwitch();

        this.renderView = renderView;
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

    onSwitchUpload = async () => {
        let width = 300;
        let height = 300;

        // get width and height of the collection doc
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1]; // this should be the collection doc since the positions should be locked
                const docView = DocumentManager.Instance.getDocumentView(collectionDoc);
                if (docView) {
                    width = docView.nativeWidth ? docView.nativeWidth : 300;
                    height = docView.nativeHeight ? docView.nativeHeight : 300;
                }
            }
        }
        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: true,
            width: width,
            height: height,
            text: "Documents uploaded from mobile will show here",
        });
    }

    renderDefaultContent = () => {
        if (this.mainContainer) {
            return <DocumentView
                Document={this.mainContainer}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={returnFalse}
                addDocTab={returnFalse}
                pinToPres={emptyFunction}
                rootSelected={returnFalse}
                removeDocument={undefined}
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
                    <CollectionView
                        Document={this.mainContainer}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        fieldKey={""}
                        dropAction={"alias"}
                        bringToFront={emptyFunction }
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
                        renderDepth={0}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}>
                    </CollectionView>
                </div>
            );
        }
    }

    upload = async (e: React.MouseEvent) => {
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1]; // this should be the collection doc since the positions should be locked
                const children = DocListCast(collectionDoc.data);
                const uploadDoc = children.length === 1 ? children[0] : Docs.Create.StackingDocument(children, {
                    title: "Mobile Upload Collection", backgroundColor: "white", lockedPosition: true, _width: 300, _height: 300
                });
                if (uploadDoc) {
                    DocServer.Mobile.dispatchMobileDocumentUpload({
                        docId: uploadDoc[Id],
                    });
                }
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }

    addWebToCollection = async () => {
        let url = "https://en.wikipedia.org/wiki/Hedgehog";
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const webDoc = await data[0];
                const urlField: FieldResult<WebField> = Cast(webDoc.data, WebField);
                url = urlField ? urlField.url.toString() : "https://en.wikipedia.org/wiki/Hedgehog";

            }
        }
        Docs.Create.WebDocument(url, { _width: 300, _height: 300, title: "Mobile Upload Web Doc" });
    }

    clearUpload = async () => {
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1];
                const children = DocListCast(collectionDoc.data);
                children.forEach(doc => {
                });
                // collectionDoc[data] = new List<Doc>();
            }
        }
    }

    renderUploadContent() {
        if (this.mainContainer) {
            return (
                <div className="mobileInterface" onDragOver={this.onDragOver}>
                    <div className="mobileInterface-inkInterfaceButtons">
                        <button className="mobileInterface-button cancel" onClick={this.onBack} title="Back">BACK</button>
                        {/* <button className="mobileInterface-button" onClick={this.clearUpload} title="Clear Upload">CLEAR</button> */}
                        {/* <button className="mobileInterface-button" onClick={this.addWeb} title="Add Web Doc to Upload Collection"></button> */}
                        <button className="mobileInterface-button" onClick={this.upload} title="Upload">UPLOAD</button>
                    </div>
                    <DocumentView
                        Document={this.mainContainer}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        addDocument={returnFalse}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        rootSelected={returnFalse}
                        removeDocument={undefined}
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

    onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    render() {
        // const content = this.currentView === "main" ? this.mainContent :
        //     this.currentView === "ink" ? this.inkContent :
        //         this.currentView === "upload" ? this.uploadContent : <></>;
        return (
            <div className="mobileInterface-container" onDragOver={this.onDragOver}>
                {/* <DocumentDecorations />
                <GestureOverlay>
                    {this.renderView ? this.renderView() : this.renderDefaultContent()}
                </GestureOverlay> */}

                {/* <DictationOverlay />
                <SharingManager />
                <GoogleAuthenticationManager /> */}
                <DocumentDecorations />
                <GestureOverlay>
                    {this.renderView ? this.renderView() : this.renderDefaultContent()}
                </GestureOverlay>
                <PreviewCursor />
                {/* <ContextMenu /> */}
                <RadialMenu />
                <RichTextMenu />
                {/* <PDFMenu />
                <MarqueeOptionsMenu />
                <OverlayView /> */}
            </div>
        );
    }
}

Scripting.addGlobal(function switchMobileView(doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); });
Scripting.addGlobal(function onSwitchMobileInking() { return MobileInterface.Instance.onSwitchInking(); });
Scripting.addGlobal(function renderMobileInking() { return MobileInterface.Instance.renderInkingContent(); });
Scripting.addGlobal(function onSwitchMobileUpload() { return MobileInterface.Instance.onSwitchUpload(); });
Scripting.addGlobal(function renderMobileUpload() { return MobileInterface.Instance.renderUploadContent(); });
Scripting.addGlobal(function addWebToMobileUpload() { return MobileInterface.Instance.addWebToCollection(); });

