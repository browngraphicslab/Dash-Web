import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc } from '../../../../new_fields/Doc';
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

    @observable private layouts: Layout[] | undefined;

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Doc) => {
        // const columnUnitLength = this.columnUnitLength;
        // if (columnUnitLength === undefined) {
        //     return Transform.Identity(); // we're still waiting on promises to resolve
        // }
        let offset = 0;
        for (const { layout: candidate } of this.childLayoutPairs) {
            if (candidate === layout) {
                return this.props.ScreenToLocalTransform().translate(-offset, 0);
            }
            offset += 194 + 10;
        }
        return Transform.Identity(); // type coersion, this case should never be hit
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

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
        />;
    }

    //@action
    set layout(layouts: Layout[]) {
        this.layouts = layouts;
        console.log(this.layouts[0]);
    }

    @computed
    get layout() {
        if (this.layouts === undefined) {
            this.layouts = [];
            console.log("empty");
            for (let i = 0; i < this.childLayoutPairs.length; i++) {
                this.layouts.push(
                    { i: 'wrapper' + i, x: 2 * (i % 5), y: 2 * Math.floor(i / 5), w: 2, h: 2 }
                );
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
        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const dxf = () => this.lookupIndividualTransform(layout).translate(-NumCast(Document._xMargin), -NumCast(Document._yMargin));
            const width = () => 300;  //this.lookupPixels(layout);
            const height = () => 300;//PanelHeight() - 2 * NumCast(Document._yMargin) - (BoolCast(Document.showWidthLabels) ? 20 : 0);
            collector.push(
                <div className={"document-wrapper"}
                    key={"wrapper" + i}
                //style={{ width: width() }}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div>
            );

            layoutArray.push(
                { i: 'wrapper' + i, x: 2 * (i % 5), y: 2 * Math.floor(i / 5), w: 2, h: 2 }
                // add values to document
            );
        }
        return [collector, layoutArray];
    }

    render(): JSX.Element {

        const contents: JSX.Element[] = this.contents?.[0];
        const layout: Layout[] = this.contents?.[1];

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
                />
            </div>
        );
    }
}
