import { computed, observable } from 'mobx';
import * as React from "react";
import { Doc, DocListCast } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast } from '../../../../fields/Types';
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
import "./CollectionGridView.scss";

type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = this.props.Document.numCols ? this.props.Document.numCols : 10;
        this.props.Document.rowHeight = this.props.Document.rowHeight ? this.props.Document.rowHeight : 100;
        this.props.Document.flexGrid = (this.props.Document.flexGrid !== undefined) ? this.props.Document.flexGrid : true;

        this.setLayout = this.setLayout.bind(this);
        this.deleteInContext = this.deleteInContext.bind(this);
    }

    componentDidMount() {
        if (!(this.props.Document.gridLayouts as List<Doc>)?.length) {

            console.log("no layouts stored on doc");

            this.props.Document.gridLayouts = new List<Doc>();

            for (let i = 0; i < this.childLayoutPairs.length; i++) {

                const layoutDoc: Doc = new Doc();
                layoutDoc.i = this.childLayoutPairs[i].layout[Id];
                layoutDoc.x = 2 * (i % Math.floor(this.props.Document.numCols as number / 2));
                layoutDoc.y = 2 * Math.floor(i / Math.floor(this.props.Document.numCols as number / 2));
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

        // const yTranslation = document.getElementById(doc.i as string)?.getBoundingClientRect().top;
        // const xTranslation = document.getElementById(doc.i as string)?.getBoundingClientRect().left;// - 250;

        //console.log(xTranslation);

        //console.log(`width: ${doc.w} height: ${doc.h} x: ${doc.x} y:${doc.y}`);

        const xTranslation = doc.x as number * this.props.PanelWidth() / (this.props.Document.numCols as number) + 10;
        const yTranslation = doc.y as number * (this.props.Document.rowHeight as number + 10) + 10;

        if (xTranslation === undefined || yTranslation === undefined) {
            console.log("undefined babey");
            return Transform.Identity();
        }

        console.log(`xtrans: ${xTranslation}  ytrans:${yTranslation}`);

        return this.props.ScreenToLocalTransform().translate(-xTranslation, -yTranslation);//.translate(-NumCast(this.props.Document._xMargin), -NumCast(this.props.Document._yMargin));

    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    /**
     * Sets the width of the decorating box.
     * @param Doc doc
     */
    private width = (doc: Doc) => {

        // return document.getElementById(doc.i as string)?.getBoundingClientRect().width;
        const xTranslation = doc.w as number * (this.props.PanelWidth() - 10 * (this.props.Document.numCols as number + 1)) / (this.props.Document.numCols as number);
        return (this.props.PanelWidth() - 10 * (this.props.Document.numCols as number + 1)) / (this.props.Document.numCols as number) *
            (this.props.Document.flexGrid as boolean ? doc.w as number : 2) + 10 * (doc.w as number - 1);// doc.w or 2
    }
    /**
     * Sets the height of the decorating box.
     * @param doc `Doc`
     */
    private height = (doc: Doc) => {
        //console.log(document.getElementById(doc.i as string)?.getBoundingClientRect());

        // return document.getElementById(doc.i as string)?.getBoundingClientRect().height;
        return this.props.Document.rowHeight as number *
            (this.props.Document.flexGrid as boolean ? doc.h as number : 2) +
            10 * (doc.h as number - 1);// + 10;
    }

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }

    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        console.log(layout[Id]);
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
            removeDocument={this.deleteInContext}
        />;
    }

    @undoBatch
    deleteInContext(doc: Doc | Doc[]): boolean {

        if (!(this.props.Document.flexGrid as boolean)) {
            this.props.removeDocument(doc);
        }
        else {
            const docList: Doc[] = DocListCast(this.props.Document.gridLayouts);
            const newDocList: Doc[] = [];
            if (doc instanceof Doc) {
                for (const savedDoc of docList) {
                    if (savedDoc.i !== doc[Id]) {
                        console.log("compare");
                        console.log(savedDoc.i);
                        console.log(doc[Id]);
                        newDocList.push(savedDoc);
                    }
                }
                this.props.Document.gridLayouts = new List<Doc>(newDocList);
                this.props.removeDocument(doc);
            }
            // else {
            //     console.log("doc is list");
            //     this.props.removeDocument(doc);
            // }
        }
        console.log("here???? in deletei n conte");
        return true;
    }


    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @undoBatch
    setLayout(layouts: Layout[]) {

        if (this.props.Document.flexGrid) {

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
    }

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
            const dxf = () => this.lookupIndividualTransform(docList[i]);
            const width = () => this.width(docList[i]);
            const height = () => this.height(docList[i]);
            collector.push(
                <div className={"document-wrapper"}
                    key={docList?.[i].i as string}
                    id={docList?.[i].i as string}
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

        if (this.props.Document.flexGrid) {
            for (const layout of docLayoutList) {
                layouts.push(
                    { i: layout.i as string, x: layout.x as number, y: layout.y as number, w: layout.w as number, h: layout.h as number, static: !(this.props.Document.flexGrid as boolean) }
                );
            }
        }
        else {
            for (let i = 0; i < docLayoutList.length; i++) {
                layouts.push(
                    { i: docLayoutList[i].i as string, x: 2 * (i % Math.floor(this.props.Document.numCols as number / 2)), y: 2 * Math.floor(i / Math.floor(this.props.Document.numCols as number / 2)), w: 2, h: 2, static: true }
                );
            }
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
            layoutDoc.i = this.childLayoutPairs[this.childLayoutPairs.length - 1].layout[Id];
            layoutDoc.x = 2 * (previousLength % Math.floor(this.props.Document.numCols as number / 2));
            layoutDoc.y = 2 * Math.floor(previousLength / Math.floor(this.props.Document.numCols as number / 2));
            layoutDoc.w = 2;
            layoutDoc.h = 2;

            (this.props.Document.gridLayouts as List<Doc>).push(layoutDoc);
        }
    }

    render(): JSX.Element {

        this.checkUpdate();

        //console.log("here first?");

        const docList: Doc[] = DocListCast(this.props.Document.gridLayouts);

        //console.log("doclist length:::" + docList.length);
        const contents: JSX.Element[] = this.contents;
        const layout: Layout[] = this.toLayoutList(docList);

        // for (const doc of docList) {
        //     console.log(doc.i);
        // }

        // if (layout.length === 0) {
        //     console.log("layouts not loaded");
        // }
        // else {
        //     console.log("rendering with this");
        //     console.log(layout[0].w);
        // }


        return (
            <div className="collectionGridView-contents"
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
                    setLayout={this.setLayout}
                    flex={this.props.Document.flexGrid as boolean}
                />
            </div>
        );
    }
}
