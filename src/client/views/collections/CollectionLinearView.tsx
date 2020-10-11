import { Tooltip } from '@material-ui/core';
import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, HeightSym, WidthSym } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { makeInterface } from '../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { emptyFunction, returnOne, returnTrue, Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { Transform } from '../../util/Transform';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { DocumentLinksButton } from '../nodes/DocumentLinksButton';
import { LinkDescriptionPopup } from '../nodes/LinkDescriptionPopup';
import "./CollectionLinearView.scss";
import { CollectionSubView } from './CollectionSubView';
import { CollectionViewType } from './CollectionView';


type LinearDocument = makeInterface<[typeof documentSchema,]>;
const LinearDocument = makeInterface(documentSchema);

@observer
export class CollectionLinearView extends CollectionSubView(LinearDocument) {
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    @observable private _selectedIndex = -1;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _widthDisposer?: IReactionDisposer;
    private _selectedDisposer?: IReactionDisposer;

    componentWillUnmount() {
        this._dropDisposer?.();
        this._widthDisposer?.();
        this._selectedDisposer?.();
        this.childLayoutPairs.map((pair, ind) => ScriptCast(pair.layout.proto?.onPointerUp)?.script.run({ this: pair.layout.proto }, console.log));
    }

    componentDidMount() {
        // is there any reason this needs to exist? -syip.  yes, it handles autoHeight for stacking views (masonry isn't yet supported).
        this._widthDisposer = reaction(() => 5 + (this.props.Document.linearViewIsExpanded ? this.childDocs.length * (this.props.Document[HeightSym]()) : 10),
            width => this.childDocs.length && (this.props.Document._width = width),
            { fireImmediately: true }
        );

        this._selectedDisposer = reaction(
            () => NumCast(this.props.Document.selectedIndex),
            (i) => runInAction(() => {
                this._selectedIndex = i;
                let selected: any = undefined;
                this.childLayoutPairs.map(async (pair, ind) => {
                    const isSelected = this._selectedIndex === ind;
                    if (isSelected) {
                        selected = pair;
                    }
                    else {
                        ScriptCast(pair.layout.proto?.onPointerUp)?.script.run({ this: pair.layout.proto }, console.log);
                    }
                });
                if (selected && selected.layout) {
                    ScriptCast(selected.layout.proto?.onPointerDown)?.script.run({ this: selected.layout.proto }, console.log);
                }
            }),
            { fireImmediately: true }
        );
    }
    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.layoutDoc);
        }
    }

    dimension = () => NumCast(this.props.Document._height); // 2 * the padding
    getTransform = (ele: React.RefObject<HTMLDivElement>) => () => {
        if (!ele.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(ele.current);
        return new Transform(-translateX, -translateY, 1);
    }

    @action
    exitLongLinks = () => {
        if (DocumentLinksButton.StartLink) {
            if (DocumentLinksButton.StartLink.Document) {
                action((e: React.PointerEvent<HTMLDivElement>) => {
                    Doc.UnBrushDoc(DocumentLinksButton.StartLink?.Document as Doc);
                });
            }
        }
        DocumentLinksButton.StartLink = undefined;
        DocumentLinksButton.StartLinkView = undefined;
    }

    @action
    changeDescriptionSetting = () => {
        if (LinkDescriptionPopup.showDescriptions) {
            if (LinkDescriptionPopup.showDescriptions === "ON") {
                LinkDescriptionPopup.showDescriptions = "OFF";
                LinkDescriptionPopup.descriptionPopup = false;
            } else {
                LinkDescriptionPopup.showDescriptions = "ON";
            }
        } else {
            LinkDescriptionPopup.showDescriptions = "OFF";
            LinkDescriptionPopup.descriptionPopup = false;
        }
    }

    render() {
        const guid = Utils.GenerateGuid();
        const flexDir: any = StrCast(this.Document.flexDirection);
        const backgroundColor = StrCast(this.props.Document.backgroundColor, "black");
        const color = StrCast(this.props.Document.color, "white");

        const menuOpener = <label htmlFor={`${guid}`} style={{ pointerEvents: "all", cursor: "pointer", background: backgroundColor === color ? "black" : backgroundColor, }}
            onPointerDown={e => e.stopPropagation()} >
            <p>{BoolCast(this.props.Document.linearViewIsExpanded) ? "–" : "+"}</p>
        </label>;

        return <div className="collectionLinearView-outer">
            <div className="collectionLinearView" ref={this.createDashEventsTarget} >
                <Tooltip title={<><div className="dash-tooltip">{BoolCast(this.props.Document.linearViewIsExpanded) ? "Close menu" : "Open menu"}</div></>} placement="top">
                    {menuOpener}
                </Tooltip>
                <input id={`${guid}`} type="checkbox" checked={BoolCast(this.props.Document.linearViewIsExpanded)} ref={this.addMenuToggle}
                    onChange={action(() => this.props.Document.linearViewIsExpanded = this.addMenuToggle.current!.checked)} />

                <div className="collectionLinearView-content" style={{ height: this.dimension(), flexDirection: flexDir }}>
                    {this.childLayoutPairs.map((pair, ind) => {
                        const nested = pair.layout._viewType === CollectionViewType.Linear;
                        const dref = React.createRef<HTMLDivElement>();
                        const nativeWidth = NumCast(pair.layout._nativeWidth, this.dimension());
                        const scalable = pair.layout.onClick || pair.layout.onDragStart;
                        return <div className={`collectionLinearView-docBtn` + (scalable ? "-scalable" : "")} key={pair.layout[Id]} ref={dref}
                            style={{
                                pointerEvents: "all",
                                minWidth: 30,
                                width: nested ? pair.layout[WidthSym]() : this.dimension(),
                                height: nested && pair.layout.linearViewIsExpanded ? pair.layout[HeightSym]() : this.dimension(),
                            }}  >
                            <ContentFittingDocumentView
                                Document={pair.layout}
                                DataDoc={pair.data}
                                LibraryPath={this.props.LibraryPath}
                                addDocument={this.props.addDocument}
                                moveDocument={this.props.moveDocument}
                                addDocTab={this.props.addDocTab}
                                pinToPres={emptyFunction}
                                rootSelected={this.props.isSelected}
                                removeDocument={this.props.removeDocument}
                                onClick={undefined}
                                ScreenToLocalTransform={this.getTransform(dref)}
                                ContentScaling={returnOne}
                                PanelWidth={nested ? pair.layout[WidthSym] : this.dimension}
                                PanelHeight={nested ? pair.layout[HeightSym] : this.dimension}
                                renderDepth={this.props.renderDepth + 1}
                                focus={emptyFunction}
                                backgroundColor={this.props.backgroundColor}
                                parentActive={returnTrue}
                                whenActiveChanged={emptyFunction}
                                bringToFront={emptyFunction}
                                docFilters={this.props.docFilters}
                                docRangeFilters={this.props.docRangeFilters}
                                searchFilterDocs={this.props.searchFilterDocs}
                                ContainingCollectionView={undefined}
                                ContainingCollectionDoc={undefined} />
                        </div>;
                    })}
                </div>
                {DocumentLinksButton.StartLink ? <span className="bottomPopup-background" style={{
                    background: backgroundColor === color ? "black" : backgroundColor,
                    pointerEvents: "all"
                }}
                    onPointerDown={e => e.stopPropagation()} >
                    <span className="bottomPopup-text" >
                        Creating link from: {DocumentLinksButton.AnnotationId ? "Annotation in " : " "} {StrCast(DocumentLinksButton.StartLink.title).length < 51 ? DocumentLinksButton.StartLink.title : StrCast(DocumentLinksButton.StartLink.title).slice(0, 50) + '...'}
                    </span>

                    <Tooltip title={<><div className="dash-tooltip">{LinkDescriptionPopup.showDescriptions ? "Turn off description pop-up" :
                        "Turn on description pop-up"} </div></>} placement="top">
                        <span className="bottomPopup-descriptions" onClick={this.changeDescriptionSetting}>
                            Labels: {LinkDescriptionPopup.showDescriptions ? LinkDescriptionPopup.showDescriptions : "ON"}
                        </span>
                    </Tooltip>

                    <Tooltip title={<><div className="dash-tooltip">Exit link clicking mode </div></>} placement="top">
                        <span className="bottomPopup-exit" onClick={this.exitLongLinks}>
                            Clear
                        </span>
                    </Tooltip>

                </span> : null}
            </div>
        </div>;
    }
}