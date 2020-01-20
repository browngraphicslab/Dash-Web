import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, HeightSym, WidthSym } from '../../../new_fields/Doc';
import { makeInterface } from '../../../new_fields/Schema';
import { BoolCast, NumCast, StrCast, Cast } from '../../../new_fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { Transform } from '../../util/Transform';
import "./CollectionLinearView.scss";
import { CollectionViewType } from './CollectionView';
import { CollectionSubView } from './CollectionSubView';
import { DocumentView } from '../nodes/DocumentView';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { ScriptField } from '../../../new_fields/ScriptField';


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
        this._dropDisposer && this._dropDisposer();
        this._widthDisposer && this._widthDisposer();
        this._selectedDisposer && this._selectedDisposer();
        this.childLayoutPairs.filter((pair) => this.isCurrent(pair.layout)).map((pair, ind) => {
            Cast(pair.layout.proto?.onPointerUp, ScriptField)?.script.run({ this: pair.layout.proto }, console.log);
        });
    }

    componentDidMount() {
        // is there any reason this needs to exist? -syip.  yes, it handles autoHeight for stacking views (masonry isn't yet supported).
        this._widthDisposer = reaction(() => NumCast(this.props.Document.height, 0) + this.childDocs.length + (this.props.Document.isExpanded ? 1 : 0),
            () => this.props.Document.width = 5 + (this.props.Document.isExpanded ? this.childDocs.length * (this.props.Document[HeightSym]()) : 10),
            { fireImmediately: true }
        );

        this._selectedDisposer = reaction(
            () => NumCast(this.props.Document.selectedIndex),
            (i) => runInAction(() => {
                this._selectedIndex = i;
                let selected: any = undefined;
                this.childLayoutPairs.filter((pair) => this.isCurrent(pair.layout)).map((pair, ind) => {
                    const isSelected = this._selectedIndex === ind;
                    if (isSelected) {
                        selected = pair;
                    }
                    else {
                        Cast(pair.layout.proto?.onPointerUp, ScriptField)?.script.run({ this: pair.layout.proto }, console.log);
                    }
                });
                if (selected && selected.layout) {
                    Cast(selected.layout.proto?.onPointerDown, ScriptField)?.script.run({ this: selected.layout.proto }, console.log);
                }
            }),
            { fireImmediately: true }
        );
    }
    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    dimension = () => NumCast(this.props.Document.height); // 2 * the padding
    getTransform = (ele: React.RefObject<HTMLDivElement>) => () => {
        if (!ele.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(ele.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }

    render() {
        const guid = Utils.GenerateGuid();
        return <div className="collectionLinearView-outer">
            <div className="collectionLinearView" ref={this.createDashEventsTarget} >
                <input id={`${guid}`} type="checkbox" checked={BoolCast(this.props.Document.isExpanded)} ref={this.addMenuToggle}
                    onChange={action((e: any) => this.props.Document.isExpanded = this.addMenuToggle.current!.checked)} />
                <label htmlFor={`${guid}`} style={{ marginTop: "auto", marginBottom: "auto", background: StrCast(this.props.Document.backgroundColor, "black") === StrCast(this.props.Document.color, "white") ? "black" : StrCast(this.props.Document.backgroundColor, "black") }} title="Close Menu"><p>+</p></label>

                <div className="collectionLinearView-content" style={{ height: this.dimension(), width: NumCast(this.props.Document.width, 25) }}>
                    {this.childLayoutPairs.filter((pair) => this.isCurrent(pair.layout)).map((pair, ind) => {
                        const nested = pair.layout.viewType === CollectionViewType.Linear;
                        const dref = React.createRef<HTMLDivElement>();
                        const nativeWidth = NumCast(pair.layout.nativeWidth, this.dimension());
                        const deltaSize = nativeWidth * .15 / 2;
                        return <div className={`collectionLinearView-docBtn` + (pair.layout.onClick || pair.layout.onDragStart ? "-scalable" : "")} key={pair.layout[Id]} ref={dref}
                            style={{
                                width: nested ? pair.layout[WidthSym]() : this.dimension() - deltaSize,
                                height: nested && pair.layout.isExpanded ? pair.layout[HeightSym]() : this.dimension() - deltaSize,
                            }}  >
                            <DocumentView
                                Document={pair.layout}
                                DataDoc={pair.data}
                                LibraryPath={this.props.LibraryPath}
                                addDocument={this.props.addDocument}
                                moveDocument={this.props.moveDocument}
                                addDocTab={this.props.addDocTab}
                                pinToPres={emptyFunction}
                                removeDocument={this.props.removeDocument}
                                ruleProvider={undefined}
                                onClick={undefined}
                                ScreenToLocalTransform={this.getTransform(dref)}
                                ContentScaling={returnOne}
                                PanelWidth={nested ? pair.layout[WidthSym] : () => this.dimension()}// ugh - need to get rid of this inline function to avoid recomputing
                                PanelHeight={nested ? pair.layout[HeightSym] : () => this.dimension()}
                                renderDepth={this.props.renderDepth + 1}
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
                        </div>;
                    })}
                </div>
            </div>
        </div>;
    }
}