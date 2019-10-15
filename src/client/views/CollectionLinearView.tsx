import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, computed, IReactionDisposer, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast, Opt, HeightSym } from '../../new_fields/Doc';
import { InkTool } from '../../new_fields/InkField';
import { ObjectField } from '../../new_fields/ObjectField';
import { ScriptField } from '../../new_fields/ScriptField';
import { NumCast, StrCast } from '../../new_fields/Types';
import { emptyFunction, returnEmptyString, returnOne, returnTrue, returnFalse, Utils } from '../../Utils';
import { Docs } from '../documents/Documents';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { InkingControl } from './InkingControl';
import { DocumentView, documentSchema } from './nodes/DocumentView';
import "./CollectionLinearView.scss";
import { makeInterface } from '../../new_fields/Schema';
import { CollectionSubView } from './collections/CollectionSubView';
import { DocumentType } from '../documents/DocumentTypes';


type LinearDocument = makeInterface<[typeof documentSchema,]>;
const LinearDocument = makeInterface(documentSchema);

@observer
export class CollectionLinearView extends CollectionSubView(LinearDocument) {
    @observable public addMenuToggle = React.createRef<HTMLInputElement>();
    @observable private _checked = false;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _heightDisposer?: IReactionDisposer;

    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        this._heightDisposer && this._heightDisposer();
    }

    componentDidMount() {
        // is there any reason this needs to exist? -syip.  yes, it handles autoHeight for stacking views (masonry isn't yet supported).
        this._heightDisposer = reaction(() => NumCast(this.props.Document.height, 0) + this.childDocs.length + (this._checked ? 1 : 0),
            () => {
                if (true || this.props.Document.fitWidth) {
                    this.props.Document.width = 36 + (this._checked ? this.childDocs.length * (this.props.Document[HeightSym]() + 10) : 10);
                }
            },
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
            if (!doc.onDragStart && this.props.Document.convertToButtons) {
                dbox = Docs.Create.FontIconDocument({ nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: "bolt" });
                dbox.dragFactory = doc;
                dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
                dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
            }
            (de.data as DragManager.DocumentDragData).droppedDocuments[i] = dbox;
        });
        e.stopPropagation();
        return super.drop(e, de);
    });

    selected = (tool: InkTool) => {
        if (!InkingControl.Instance || InkingControl.Instance.selectedTool === InkTool.None) return { display: "none" };
        if (InkingControl.Instance.selectedTool === tool) {
            return { color: "#61aaa3", fontSize: "50%" };
        }
        return { fontSize: "50%" };
    }

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    dimension = () => NumCast(this.props.Document.height) - 5;
    render() {
        let guid = Utils.GenerateGuid();
        return <div className="collectionLinearView-outer">
            <div className="collectionLinearView" ref={this.createDropTarget} >
                <input id={`${guid}`} type="checkbox" ref={this.addMenuToggle} onChange={action((e: any) => this._checked = this.addMenuToggle.current!.checked)} />
                <label htmlFor={`${guid}`} style={{ marginTop: (this.dimension() - 36) / 2, marginBottom: "auto" }} title="Close Menu"><p>+</p></label>

                <div className="collectionLinearView-content">
                    {this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair =>
                        <div className={`collectionLinearView-docBtn` + (pair.layout.onClick ? "-scalable" : "")} style={{ width: this.dimension(), height: this.dimension() }} key={StrCast(pair.layout.title)} >
                            <DocumentView
                                Document={pair.layout}
                                DataDoc={pair.data}
                                addDocument={this.props.addDocument}
                                addDocTab={this.props.addDocTab}
                                pinToPres={emptyFunction}
                                removeDocument={this.props.removeDocument}
                                ruleProvider={undefined}
                                onClick={undefined}
                                ScreenToLocalTransform={Transform.Identity}
                                ContentScaling={() => this.dimension() / (10 + NumCast(pair.layout.nativeWidth, this.dimension()))} // ugh - need to get rid of this inline function to avoid recomputing
                                PanelWidth={this.dimension}
                                PanelHeight={this.dimension}
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
                        </div>)}
                    {/* <li key="undoTest"><button className="add-button round-button" title="Click if undo isn't working" onClick={() => UndoManager.TraceOpenBatches()}><FontAwesomeIcon icon="exclamation" size="sm" /></button></li> */}
                    {this.props.showHiddenControls ? <>
                        <button className="collectionLinearView-toolbar-button collectionLinearView-round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /> </button>
                        <button key="pen" onClick={() => InkingControl.Instance.switchTool(InkTool.Pen)} title="Pen" style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" /></button>
                        <button key="marker" onClick={() => InkingControl.Instance.switchTool(InkTool.Highlighter)} title="Highlighter" style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" /></button>
                        <button key="eraser" onClick={() => InkingControl.Instance.switchTool(InkTool.Eraser)} title="Eraser" style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" /></button>
                        <InkingControl />
                    </> : (null)}
                </div>
            </div>
        </div>;
    }
}