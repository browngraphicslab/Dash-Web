import { action, IReactionDisposer, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, HeightSym, WidthSym } from '../../new_fields/Doc';
import { ObjectField } from '../../new_fields/ObjectField';
import { makeInterface } from '../../new_fields/Schema';
import { ScriptField } from '../../new_fields/ScriptField';
import { BoolCast, NumCast, StrCast } from '../../new_fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, Utils } from '../../Utils';
import { Docs } from '../documents/Documents';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import "./CollectionLinearView.scss";
import { CollectionViewType } from './collections/CollectionBaseView';
import { CollectionSubView } from './collections/CollectionSubView';
import { documentSchema, DocumentView } from './nodes/DocumentView';
import { translate } from 'googleapis/build/src/apis/translate';


type LinearDocument = makeInterface<[typeof documentSchema,]>;
const LinearDocument = makeInterface(documentSchema);

@observer
export class CollectionLinearView extends CollectionSubView(LinearDocument) {
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _heightDisposer?: IReactionDisposer;
    private _spacing = 20;

    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        this._heightDisposer && this._heightDisposer();
    }

    componentDidMount() {
        // is there any reason this needs to exist? -syip.  yes, it handles autoHeight for stacking views (masonry isn't yet supported).
        this._heightDisposer = reaction(() => NumCast(this.props.Document.height, 0) + this.childDocs.length + (this.props.Document.isExpanded ? 1 : 0),
            () => this.props.Document.width = 18 + (this.props.Document.isExpanded ? this.childDocs.length * (this.props.Document[HeightSym]()) : 10),
            { fireImmediately: true }
        );
    }
    protected createDropTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    drop = action((e: Event, de: DragManager.DropEvent) => {
        (de.data as DragManager.DocumentDragData).draggedDocuments.map((doc, i) => {
            let dbox = doc;
            if (!doc.onDragStart && !doc.onClick && this.props.Document.convertToButtons && doc.viewType !== CollectionViewType.Linear) {
                dbox = Docs.Create.FontIconDocument({ nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: "bolt" });
                dbox.dragFactory = doc;
                dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
                dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
            } else if (doc.viewType === CollectionViewType.Linear) {
                dbox.ignoreClick = true;
            }
            (de.data as DragManager.DocumentDragData).droppedDocuments[i] = dbox;
        });
        e.stopPropagation();
        return super.drop(e, de);
    });

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    dimension = () => NumCast(this.props.Document.height); // 2 * the padding
    getTransform = (ele: React.RefObject<HTMLDivElement>) => () => {
        if (!ele.current) return Transform.Identity();
        let { scale, translateX, translateY } = Utils.GetScreenTransform(ele.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }
    render() {
        let guid = Utils.GenerateGuid();
        return <div className="collectionLinearView-outer">
            <div className="collectionLinearView" ref={this.createDropTarget} >
                <input id={`${guid}`} type="checkbox" checked={BoolCast(this.props.Document.isExpanded)} ref={this.addMenuToggle}
                    onChange={action((e: any) => this.props.Document.isExpanded = this.addMenuToggle.current!.checked)} />
                <label htmlFor={`${guid}`} style={{ marginTop: "auto", marginBottom: "auto", background: StrCast(this.props.Document.backgroundColor, "black") === StrCast(this.props.Document.color, "white") ? "black" : StrCast(this.props.Document.backgroundColor, "black") }} title="Close Menu"><p>+</p></label>

                <div className="collectionLinearView-content">
                    {this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair => {
                        let nested = pair.layout.viewType === CollectionViewType.Linear;
                        let dref = React.createRef<HTMLDivElement>();
                        let nativeWidth = NumCast(pair.layout.nativeWidth, this.dimension());
                        let scalingContent = nested ? 1 : this.dimension() / (this._spacing + nativeWidth);
                        let scalingBox = nested ? 1 : this.dimension() / nativeWidth;
                        let deltaSize = nativeWidth * scalingBox - nativeWidth * scalingContent;
                        return <div className={`collectionLinearView-docBtn` + (pair.layout.onClick || pair.layout.onDragStart ? "-scalable" : "")} key={StrCast(pair.layout.title)} ref={dref}
                            style={{
                                width: nested ? pair.layout[WidthSym]() : this.dimension(),
                                height: nested && pair.layout.isExpanded ? pair.layout[HeightSym]() : this.dimension(),
                                transform: nested ? undefined : `translate(${deltaSize / 2}px, ${deltaSize / 2}px)`
                            }}  >
                            <DocumentView
                                Document={pair.layout}
                                DataDoc={pair.data}
                                addDocument={this.props.addDocument}
                                moveDocument={this.props.moveDocument}
                                addDocTab={this.props.addDocTab}
                                pinToPres={emptyFunction}
                                removeDocument={this.props.removeDocument}
                                ruleProvider={undefined}
                                onClick={undefined}
                                ScreenToLocalTransform={this.getTransform(dref)}
                                ContentScaling={() => scalingContent} // ugh - need to get rid of this inline function to avoid recomputing
                                PanelWidth={() => nested ? pair.layout[WidthSym]() : this.dimension()}
                                PanelHeight={() => nested ? pair.layout[HeightSym]() : this.dimension()}
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
                    {/* <li key="undoTest"><button className="add-button round-button" title="Click if undo isn't working" onClick={() => UndoManager.TraceOpenBatches()}><FontAwesomeIcon icon="exclamation" size="sm" /></button></li> */}

                </div>
            </div>
        </div>;
    }
}