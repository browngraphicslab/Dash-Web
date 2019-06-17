import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, observable, reaction, Lambda, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import Measure, { ContentRect } from "react-measure";
import { Doc, Field, Opt, DocListCast } from "../../../new_fields/Doc";
import { FieldId } from "../../../new_fields/RefField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Transform } from '../../util/Transform';
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import { SubCollectionViewProps } from "./CollectionSubView";
import React = require("react");
import { CollectionViewType } from './CollectionBaseView';
import { Id } from '../../../new_fields/FieldSymbols';
import { CollectionDockingView } from './CollectionDockingView';

interface DockedFrameProps {
    documentId: FieldId;
    glContainer: any;
    glEventHub: any;
    parent: CollectionDockingView;
}

@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {
    _mainCont = React.createRef<HTMLDivElement>();
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Doc>;
    private get parentProps(): SubCollectionViewProps {
        return this.props.parent.props;
    }

    get _stack(): any {
        let parent = this.props.glContainer.parent.parent;
        if (this._document && this._document.excludeFromLibrary && parent.parent && parent.parent.contentItems.length > 1)
            return parent.parent.contentItems[1];
        return parent;
    }
    constructor(props: any) {
        super(props);
        DocServer.getRefField(this.props.documentId).then(action((f: Opt<Field>) => this._document = f as Doc));
    }

    nativeWidth = () => NumCast(this._document!.nativeWidth, this._panelWidth);
    nativeHeight = () => NumCast(this._document!.nativeHeight, this._panelHeight);
    contentScaling = () => {
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        let wscale = this._panelWidth / nativeW;
        return wscale * nativeH > this._panelHeight ? this._panelHeight / nativeH : wscale;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont.current && this._mainCont.current.children) {
            let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current.children[0].firstChild as HTMLElement);
            scale = Utils.GetScreenTransform(this._mainCont.current).scale;
            return this.parentProps.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.contentScaling() / scale);
        }
        return Transform.Identity();
    }
    get scaleToFitMultiplier() {
        let docWidth = NumCast(this._document!.width);
        let docHeight = NumCast(this._document!.height);
        if (NumCast(this._document!.nativeWidth) || !docWidth || !this._panelWidth || !this._panelHeight) return 1;
        if (StrCast(this._document!.layout).indexOf("Collection") === -1 ||
            NumCast(this._document!.viewType) !== CollectionViewType.Freeform) return 1;
        let scaling = Math.max(1, this._panelWidth / docWidth * docHeight > this._panelHeight ?
            this._panelHeight / docHeight : this._panelWidth / docWidth);
        return scaling;
    }
    get previewPanelCenteringOffset() { return (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2; }

    addDocTab = (doc: Doc, location: string) => {
        if (location === "onRight") {
            CollectionDockingView.AddRightSplit(doc);
        } else {
            CollectionDockingView.AddTab(this._stack, doc);
        }
    }
    get content() {
        if (!this._document) {
            return (null);
        }
        return (
            <div className="collectionDockingView-content" ref={this._mainCont}
                style={{ transform: `translate(${this.previewPanelCenteringOffset}px, 0px) scale(${this.scaleToFitMultiplier}, ${this.scaleToFitMultiplier})` }}>
                <DocumentView key={this._document[Id]} Document={this._document}
                    bringToFront={emptyFunction}
                    addDocument={undefined}
                    removeDocument={undefined}
                    ContentScaling={this.contentScaling}
                    PanelWidth={this.nativeWidth}
                    PanelHeight={this.nativeHeight}
                    ScreenToLocalTransform={this.ScreenToLocalTransform}
                    isTopMost={true}
                    selectOnLoad={false}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    focus={emptyFunction}
                    addDocTab={this.addDocTab}
                    ContainingCollectionView={undefined} />
            </div >);
    }

    render() {
        let theContent = this.content;
        return !this._document ? (null) :
            <Measure offset onResize={action((r: any) => { this._panelWidth = r.offset.width; this._panelHeight = r.offset.height; })}>
                {({ measureRef }) => <div ref={measureRef}>  {theContent} </div>}
            </Measure>;
    }
}