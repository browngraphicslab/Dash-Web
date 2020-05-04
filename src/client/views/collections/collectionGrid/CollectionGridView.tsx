import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc, DataSym, DocListCast } from '../../../../new_fields/Doc';
import { documentSchema } from '../../../../new_fields/documentSchemas';
import { makeInterface } from '../../../../new_fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast, Cast } from '../../../../new_fields/Types';
import { DragManager } from '../../../util/DragManager';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { List } from '../../../../new_fields/List';
import { returnZero } from '../../../../Utils';
import Grid from "./Grid";
import { Layout } from "./Grid";


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

export class CollectionGridView extends CollectionSubView(GridSchema) {

    private layouts: Layout[] = [];
    private layoutDocs: Doc[] = [];
    @observable private numCols: number = 10;
    @observable private rowHeight: number = 100;
    @observable private isMounted: boolean = false;

    componentDidMount() {
        this.isMounted = true;
    }

    componentWillUnmount() {
        this.isMounted = false;
        console.log("hola");
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Layout) => {

        const yTranslation = this.rowHeight * layout.y;// + 15 * (layout.y - 1);
        console.log(yTranslation);
        return this.props.ScreenToLocalTransform().translate(-this.props.PanelWidth() / this.numCols * layout.x, -yTranslation);
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    @observable private width = (layout: Layout) => layout.w * this.props.PanelWidth() / this.numCols;
    @observable private height = (layout: Layout) => layout.h * this.rowHeight;

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
            DataDocument={layout.resolvedDataDoc as Doc}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            addDocTab={this.addDocTab}
            fitToBox={BoolCast(this.props.Document._freezeChildDimensions)}
            FreezeDimensions={BoolCast(this.props.Document._freezeChildDimensions)}
            backgroundColor={this.props.backgroundColor}
            CollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            getTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            Display={"contents"}
        />;
    }


    //@action
    set layout(layouts: Layout[]) {
        this.layouts = layouts;
        this.props.Document.gridLayouts = new List<Doc>();
        for (const layout of layouts) {
            const layoutDoc = new Doc();
            layoutDoc.i = layout.i;
            layoutDoc.x = layout.x;
            layoutDoc.y = layout.y;
            layoutDoc.w = layout.w;
            layoutDoc.h = layout.h;

            (this.props.Document.gridLayouts as List<Doc>).push(layoutDoc);
            console.log("gazoinks");

        }
        this.forceUpdate(); // better way to do this?
    }

    get layout() {
        //console.log(this.layouts.length === 0);
        if (this.layouts.length === 0) {
            if (this.props.Document.gridLayouts) {
                //console.log(this.props.Document.gridLayouts);
                //     for (const layout of (this.props.Document.gridLayouts as List<Doc>)) {
                //         if (layout instanceof Doc) {
                //             this.layouts.push(
                //                 { i: layout.i as string, x: layout.x as number, y: layout.y as number, w: layout.w as number, h: layout.h as number }
                //             );
                //         }
                //         else {
                //             layout.then((layout: Doc) => {
                //                 this.layouts.push(
                //                     { i: layout.i as string, x: layout.x as number, y: layout.y as number, w: layout.w as number, h: layout.h as number }
                //                 );
                //                 console.log(layout.i);
                //             });
                //         }
                //     }
                // }
                for (const layout of DocListCast(this.props.Document.gridLayouts)) {
                    this.layouts.push(
                        { i: layout.i as string, x: layout.x as number, y: layout.y as number, w: layout.w as number, h: layout.h as number }
                    );
                }
            }
            else {
                for (let i = 0; i < this.childLayoutPairs.length; i++) {
                    this.layouts.push(
                        { i: 'wrapper' + i, x: 2 * (i % 5), y: 2 * Math.floor(i / 5), w: 2, h: 2 }
                    );

                    const layoutDoc: Doc = new Doc();
                    layoutDoc.i = "wrapper" + i;
                    layoutDoc.x = 2 * (i % 5);
                    layoutDoc.y = 2 * Math.floor(i / 5);
                    layoutDoc.w = 2;
                    layoutDoc.h = 2;

                    this.layoutDocs.push(layoutDoc);
                }
                this.props.Document.gridLayouts = new List<Doc>(this.layoutDocs);
            }
        }

        return this.layouts;
    }

    @computed
    private get contents(): [JSX.Element[], Layout[]] {
        const { childLayoutPairs } = this;
        const { Document } = this.props;
        const collector: JSX.Element[] = [];
        const layoutArray: Layout[] = [];


        const previousLength = this.layout.length;
        layoutArray.push(...this.layout);

        if (!layoutArray.length) {
            return [[], []];
        }

        if (this.childLayoutPairs.length > previousLength) {
            layoutArray.push(
                { i: 'wrapper' + previousLength, x: 2 * (previousLength % 5), y: 2 * Math.floor(previousLength / 5), w: 2, h: 2 }
                // add values to document
            );
            // this.layout.push(
            //     { i: 'wrapper' + previousLength, x: 2 * (previousLength % 5), y: 2 * Math.floor(previousLength / 5), w: 2, h: 2 }
            // );
        }

        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const dxf = () => this.lookupIndividualTransform(layoutArray[i]);//.translate(-NumCast(Document._xMargin), -NumCast(Document._yMargin));
            const width = () => this.width(layoutArray[i]);  //this.lookupPixels(layout);
            const height = () => this.height(layoutArray[i]);//PanelHeight() - 2 * NumCast(Document._yMargin) - (BoolCast(Document.showWidthLabels) ? 20 : 0);
            collector.push(
                <div className={"document-wrapper"}
                    key={"wrapper" + i}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div>
            );
        }

        return [collector, layoutArray];
    }

    render(): JSX.Element {

        const contents: JSX.Element[] = this.contents?.[0];
        const layout: Layout[] = this.contents?.[1];
        // if (this.isMounted) {
        return (
            <div className="collectionGridView_contents"
                style={{
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin)
                }} ref={this.createDashEventsTarget}>

                <Grid
                    width={this.props.PanelWidth()}
                    nodeList={contents}
                    layout={layout}
                    gridView={this}
                    numCols={this.numCols}
                    rowHeight={this.rowHeight}
                />
            </div>
        );
        // }
    }
}
