import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, HeightSym, WidthSym } from '../../../fields/Doc';
import { makeInterface } from '../../../fields/Schema';
import { BoolCast, NumCast, StrCast, Cast, ScriptCast } from '../../../fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, Utils, returnFalse, returnZero } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { Transform } from '../../util/Transform';
import "./CollectionLinearView.scss";
import { CollectionViewType } from './CollectionView';
import { CollectionSubView } from './CollectionSubView';
import { DocumentView } from '../nodes/DocumentView';
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { DocumentLinksButton } from '../nodes/DocumentLinksButton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';


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
        this._widthDisposer = reaction(() => this.props.Document[HeightSym]() + this.childDocs.length + (this.props.Document.linearViewIsExpanded ? 1 : 0),
            () => this.props.Document._width = 5 + (this.props.Document.linearViewIsExpanded ? this.childDocs.length * (this.props.Document[HeightSym]()) : 10),
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
    }

    render() {
        const guid = Utils.GenerateGuid();
        const flexDir: any = StrCast(this.Document.flexDirection);
        const backgroundColor = StrCast(this.props.Document.backgroundColor, "black");
        const color = StrCast(this.props.Document.color, "white");
        return <div className="collectionLinearView-outer">
            <div className="collectionLinearView" ref={this.createDashEventsTarget} >
                <label htmlFor={`${guid}`} title="Close Menu" style={{
                    background: backgroundColor === color ? "black" : backgroundColor,
                    // width: "18px", height: "18px", fontSize: "12.5px",
                    // transition: this.props.Document.linearViewIsExpanded ? "transform 0.2s" : "transform 0.5s",
                    // transform: this.props.Document.linearViewIsExpanded ? "" : "rotate(45deg)"
                }}
                    onPointerDown={e => e.stopPropagation()} >
                    <p>+</p>
                </label>
                <input id={`${guid}`} type="checkbox" checked={BoolCast(this.props.Document.linearViewIsExpanded)} ref={this.addMenuToggle}
                    onChange={action((e: any) => this.props.Document.linearViewIsExpanded = this.addMenuToggle.current!.checked)} />

                <div className="collectionLinearView-content" style={{ height: this.dimension(), flexDirection: flexDir }}>
                    {this.childLayoutPairs.map((pair, ind) => {
                        const nested = pair.layout._viewType === CollectionViewType.Linear;
                        const dref = React.createRef<HTMLDivElement>();
                        const nativeWidth = NumCast(pair.layout._nativeWidth, this.dimension());
                        const deltaSize = nativeWidth * .15 / 2;
                        const scalable = pair.layout.onClick || pair.layout.onDragStart;
                        return <div className={`collectionLinearView-docBtn` + (scalable ? "-scalable" : "")} key={pair.layout[Id]} ref={dref}
                            style={{
                                width: scalable ? (nested ? pair.layout[WidthSym]() : this.dimension() - deltaSize) : undefined,
                                height: nested && pair.layout.linearViewIsExpanded ? pair.layout[HeightSym]() : this.dimension() - deltaSize,
                            }}  >
                            <DocumentView
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
                                NativeHeight={returnZero}
                                NativeWidth={returnZero}
                                PanelWidth={nested ? pair.layout[WidthSym] : () => this.dimension()}// ugh - need to get rid of this inline function to avoid recomputing
                                PanelHeight={nested ? pair.layout[HeightSym] : () => this.dimension()}
                                renderDepth={this.props.renderDepth + 1}
                                focus={emptyFunction}
                                backgroundColor={returnEmptyString}
                                parentActive={returnTrue}
                                whenActiveChanged={emptyFunction}
                                bringToFront={emptyFunction}
                                docFilters={this.props.docFilters}
                                ContainingCollectionView={undefined}
                                ContainingCollectionDoc={undefined} />
                        </div>;
                    })}
                </div>
                {DocumentLinksButton.StartLink ? <span className="bottomPopup-background" style={{
                    background: backgroundColor === color ? "black" : backgroundColor
                }}
                    onPointerDown={e => e.stopPropagation()} >
                    <span className="bottomPopup-text" >
                        Creating link from: {(DocumentLinksButton.AnnotationId ? "Annotation in " : "")} {DocumentLinksButton.StartLink.title} </span>
                    <span className="bottomPopup-exit" onClick={this.exitLongLinks}
                    >Exit</span>

                    {/* <FontAwesomeIcon icon="times-circle" size="lg" style={{ color: "red" }}
                        onClick={this.exitLongLinks} /> */}

                </span> : null}
            </div>
        </div>;
    }
}