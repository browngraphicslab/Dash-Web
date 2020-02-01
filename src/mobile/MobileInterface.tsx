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
    @observable private currentView: "main" | "ink" | "library" = "main";

    private mainDoc = CurrentUserUtils.setupMobileDoc(this.userDoc);
    private inkDoc?: Doc;
    public drawingInk: boolean = false;

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
    switchCurrentView = (view: "main" | "ink" | "library") => {
        this.currentView = view;

        if (this.userDoc) {
            switch (view) {
                case "main": {
                    // const doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
                    this.userDoc.activeMobile = this.mainDoc;
                    break;
                }
                case "ink": {
                    this.inkDoc = CurrentUserUtils.setupMobileInkingDoc(this.userDoc);
                    this.userDoc.activeMobile = this.inkDoc;
                    InkingControl.Instance.switchTool(InkTool.Pen);
                    this.drawingInk = true;

                    DocServer.Mobile.dispatchOverlayTrigger({
                        enableOverlay: true,
                        width: window.innerWidth,
                        height: window.innerHeight
                    });

                    break;
                }
            }
        }
    }

    @computed
    get mainContent() {
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
        this.switchCurrentView("main");
        InkingControl.Instance.switchTool(InkTool.None); // TODO: switch to previous tool

        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: false,
            width: window.innerWidth,
            height: window.innerHeight
        });

        this.inkDoc = undefined;
        this.drawingInk = false;
    }

    shiftLeft = (e: React.MouseEvent) => {
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: -10
        });
    }

    shiftRight = (e: React.MouseEvent) => {
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: 10
        });
    }

    @computed
    get inkContent() {
        // TODO: support panning and zooming
        // TODO: handle moving of ink strokes
        if (this.mainContainer) {
            return (
                <div className="mobileInterface">
                    <div className="mobileInterface-inkInterfaceButtons">
                        <div className="navButtons">
                            <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing"><FontAwesomeIcon icon="long-arrow-alt-left" /></button>
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

    render() {
        const content = this.currentView === "main" ? this.mainContent : this.currentView === "ink" ? this.inkContent : <></>;
        return (
            <div className="mobile-container">
                {content}
            </div>
        );
    }
}

Scripting.addGlobal(function switchMobileView(view: "main" | "ink" | "library") { return MobileInterface.Instance.switchCurrentView(view); });
