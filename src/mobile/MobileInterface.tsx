import React = require('react');
import { observer } from 'mobx-react';
import { computed, action, observable } from 'mobx';
import { CurrentUserUtils } from '../server/authentication/models/current_user_utils';
import { FieldValue, Cast } from '../new_fields/Types';
import { Doc } from '../new_fields/Doc';
import { Docs } from '../client/documents/Documents';
import { CollectionView } from '../client/views/collections/CollectionView';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { emptyPath, emptyFunction, returnFalse, returnOne, returnEmptyString, returnTrue } from '../Utils';
import { Transform } from '../client/util/Transform';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPenNib, faHighlighter, faEraser, faMousePointer, faBreadSlice } from '@fortawesome/free-solid-svg-icons';
import { Scripting } from '../client/util/Scripting';
import { CollectionFreeFormView } from '../client/views/collections/collectionFreeForm/CollectionFreeFormView';
import GestureOverlay from '../client/views/GestureOverlay';

@observer
export default class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return CurrentUserUtils.UserDocument; }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    @observable private currentView: "main" | "ink" | "library" = "main";

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        library.add(...[faPenNib, faHighlighter, faEraser, faMousePointer]);

        if (this.userDoc && !this.mainContainer) {
            const doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
            this.userDoc.activeMobile = doc;
        }
    }

    @action
    switchCurrentView = (view: "main" | "ink" | "library") => {
        this.currentView = view;

        if (this.userDoc) {
            switch (view) {
                case "main": {
                    const doc = CurrentUserUtils.setupMobileDoc(this.userDoc);
                    this.userDoc.activeMobile = doc;
                    break;
                }
                case "ink": {
                    const doc = CurrentUserUtils.setupMobileInkingDoc(this.userDoc);
                    this.userDoc.activeMobile = doc;
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
                addDocument={undefined}
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

    @computed
    get inkContent() {
        // return <div>INK</div>;
        if (this.mainContainer) {
            return (
                <GestureOverlay>
                    <CollectionFreeFormView
                        Document={this.mainContainer}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        fieldKey={""}
                        addDocument={returnFalse}
                        removeDocument={returnFalse}
                        moveDocument={returnFalse}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        PanelHeight={() => window.screen.height}
                        PanelWidth={() => window.screen.width}
                        annotationsKey={""}
                        isAnnotationOverlay={false}
                        focus={emptyFunction}
                        isSelected={returnTrue} //
                        select={emptyFunction}
                        active={returnTrue} //
                        ContentScaling={returnOne}
                        whenActiveChanged={returnFalse}
                        CollectionView={undefined}
                        ScreenToLocalTransform={Transform.Identity}
                        ruleProvider={undefined}
                        renderDepth={0}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                        chromeCollapsed={true}>
                    </CollectionFreeFormView>
                </GestureOverlay>
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
