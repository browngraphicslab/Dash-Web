import { computed, observable, action } from 'mobx';
import * as React from "react";
import { Doc, DocListCast } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface, createSchema } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast, Cast } from '../../../../fields/Types';
import { DragManager } from '../../../util/DragManager';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { SubCollectionViewProps } from '../CollectionSubView';
import { List } from '../../../../fields/List';
import { returnZero } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = this.props.Document.numCols ? this.props.Document.numCols : 10;
        this.props.Document.rowHeight = this.props.Document.rowHeight ? this.props.Document.rowHeight : 100;
    }

    componentDidMount() {
        if (!(this.props.Document.gridLayouts as List<Doc>)?.length) {

            console.log("no layouts stored on doc");

            this.props.Document.gridLayouts = new List<Doc>();

            for (let i = 0; i < this.childLayoutPairs.length; i++) {

                const layoutDoc: Doc = new Doc();
                layoutDoc.i = layoutDoc[Id];
                layoutDoc.x = 2 * (i % 5);
                layoutDoc.y = 2 * Math.floor(i / 5);
                layoutDoc.w = 2;
                layoutDoc.h = 2;

                (this.props.Document.gridLayouts as List<Doc>).push(layoutDoc);

                // use childlayoutpairs length instead 
            }

        }

    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (doc: Doc) => {

        const yTranslation = (this.props.Document.rowHeight as number) * (doc.y as number) + 10 * (doc.y as number);
        return this.props.ScreenToLocalTransform().translate(-this.props.PanelWidth() / (this.props.Document.numCols as number) * (doc.x as number), -yTranslation);
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    /**
     * Sets the width of the decorating box.
     * @param Doc doc
     */
    @observable private width = (doc: Doc) => doc.w as number * this.props.PanelWidth() / (this.props.Document.numCols as number);

    /**
     * Sets the height of the decorating box.
     * @param doc `Doc`
     */
    @observable private height = (doc: Doc) => doc.h as number * (this.props.Document.rowHeight as number);

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }

    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        return <ContentFittingDocumentView
            {...this.props}
            Document={layout}
            DataDoc={layout.resolvedDataDoc as Doc}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            addDocTab={this.addDocTab}
            fitToBox={BoolCast(this.props.Document._freezeChildDimensions)}
            FreezeDimensions={BoolCast(this.props.Document._freezeChildDimensions)}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ScreenToLocalTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            display={"contents"}
        />;
    }


    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @undoBatch
    setLayout(layouts: Layout[]) {

        console.log("setting layout in CollectionGridView");
        console.log(layouts?.[0].w);
        //this.props.Document.gridLayouts = new List<Doc>();

        const docList: Doc[] = [];

        for (const layout of layouts) {
            const layoutDoc = new Doc();
            layoutDoc.i = layout.i;
            layoutDoc.x = layout.x;
            layoutDoc.y = layout.y;
            layoutDoc.w = layout.w;
            layoutDoc.h = layout.h;

            docList.push(layoutDoc);
        }

        this.props.Document.gridLayouts = new List<Doc>(docList);
    }

    // _.reject() on item removal?


    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {
        const { childLayoutPairs } = this;
        const collector: JSX.Element[] = [];
        //const layoutArray: Layout[] = [];

        const docList: Doc[] = DocListCast(this.props.Document.gridLayouts);

        const previousLength = docList.length;
        // layoutArray.push(...this.layout);

        if (!previousLength) {
            // console.log("early return");
            return [];
        }

        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const dxf = () => this.lookupIndividualTransform(docList?.[i]);
            const width = () => this.width(docList?.[i]);
            const height = () => this.height(docList?.[i]);
            collector.push(
                <div className={"document-wrapper"}
                    key={docList?.[i].i as string}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div>
            );
        }

        return collector;
    }

    /**
     * @returns a list of Layouts from a list of Docs
     * @param docLayoutList `Doc[]`
     */
    toLayoutList(docLayoutList: Doc[]): Layout[] {

        const layouts: Layout[] = [];
        for (const layout of docLayoutList) {
            layouts.push(
                { i: layout.i as string, x: layout.x as number, y: layout.y as number, w: layout.w as number, h: layout.h as number }
            );
        }
        return layouts;
    }

    /**
     * Checks whether a new node has been added to the grid and updates the Document accordingly.
     */
    @undoBatch
    checkUpdate() {
        const previousLength = (this.props.Document.gridLayouts as List<Doc>)?.length;
        if (this.childLayoutPairs.length > previousLength) {
            console.log("adding doc");
            const layoutDoc: Doc = new Doc();
            layoutDoc.i = layoutDoc[Id];
            layoutDoc.x = 2 * (previousLength % 5);
            layoutDoc.y = 2 * Math.floor(previousLength / 5);
            layoutDoc.w = 2;
            layoutDoc.h = 2;

            (this.props.Document.gridLayouts as List<Doc>).push(layoutDoc);
        }
    }

    render(): JSX.Element {

        this.checkUpdate();

        const docList: Doc[] = DocListCast(this.props.Document.gridLayouts);

        const contents: JSX.Element[] = this.contents;
        const layout: Layout[] = this.toLayoutList(docList);

        // if (layout.length === 0) {
        //     console.log("layouts not loaded");
        // }
        // else {
        //     console.log("rendering with this");
        //     console.log(layout[0].w);
        // }


        return (
            <div className="collectionGridView_contents"
                style={{
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin)
                }}
                ref={this.createDashEventsTarget}
            //onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            >
                <Grid
                    width={this.props.PanelWidth()}
                    nodeList={contents}
                    layout={layout}
                    numCols={this.props.Document.numCols as number}
                    rowHeight={this.props.Document.rowHeight as number}
                    setLayout={(layout: Layout[]) => this.setLayout(layout)}
                />
            </div>
        );
    }
}
