import { action, computed } from 'mobx';
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
import "./collectionMulticolumnView.scss";
import ColumnResizeBar from './MulticolumnResizer';
import RowResizeBar from './MultirowResizer';
import WidthLabel from './MulticolumnWidthLabel';
import HeightLabel from './MultirowHeightLabel';
import { List } from '../../../../new_fields/List';
import { returnZero } from '../../../../Utils';
import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";
import GridLayout from 'react-grid-layout';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface WidthSpecifier {
    magnitude: number;
    unit: string;
}

interface HeightSpecifier {
    magnitude: number;
    unit: string;
}

interface LayoutData {
    widthSpecifiers: WidthSpecifier[];
    heightSpecifiers: HeightSpecifier[];
    starSumCol: number;
    starSumRow: number;
}

export const DimUnit = {
    Pixel: "px",
    Ratio: "*"
};

const resolvedUnits = Object.values(DimUnit);
const resizerWidth = 8;
const resizerHeight = 8;

@observer
export class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {

    /**
     * @returns the list of layout documents whose width unit is
     * *, denoting that it will be displayed with a ratio, not fixed pixel, value
     */
    @computed
    private get ratioDefinedDocs() {
        return this.childLayoutPairs.map(pair => pair.layout).filter(layout => StrCast(layout.dimUnit, "*") === DimUnit.Ratio);
    }

    /**
     * This loops through all childLayoutPairs and extracts the values for dimUnit
     * and dimMagnitude, ignoring any that are malformed. Additionally, it then
     * normalizes the ratio values so that one * value is always 1, with the remaining
     * values proportionate to that easily readable metric.
     * @returns the list of the resolved width specifiers (unit and magnitude pairs)
     * as well as the sum of the * coefficients, i.e. the ratio magnitudes
     */
    @computed
    private get resolvedLayoutInformation(): LayoutData {
        let starSumCol = 0;
        let starSumRow = 0;
        const widthSpecifiers: WidthSpecifier[] = [];
        const heightSpecifiers: HeightSpecifier[] = [];
        this.childLayoutPairs.map(pair => {
            const unit = StrCast(pair.layout.dimUnit, "*");
            const magnitude = NumCast(pair.layout.dimMagnitude, 1);
            if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                (unit === DimUnit.Ratio) && (starSumCol += magnitude) && (starSumRow += magnitude);
                widthSpecifiers.push({ magnitude, unit });
                heightSpecifiers.push({ magnitude, unit });
            }
            /**
             * Otherwise, the child document is ignored and the remaining
             * space is allocated as if the document were absent from the child list
             */
        });

        /**
         * Here, since these values are all relative, adjustments during resizing or
         * manual updating can, though their ratios remain the same, cause the values
         * themselves to drift toward zero. Thus, whenever we change any of the values,
         * we normalize everything (dividing by the smallest magnitude).
         */
        setTimeout(() => {
            const { ratioDefinedDocs } = this;
            if (this.childLayoutPairs.length) {
                const minimum = Math.min(...ratioDefinedDocs.map(doc => NumCast(doc.dimMagnitude, 1)));
                if (minimum !== 0) {
                    ratioDefinedDocs.forEach(layout => layout.dimMagnitude = NumCast(layout.dimMagnitude, 1) / minimum, 1);
                }
            }
        });

        return { widthSpecifiers, heightSpecifiers, starSumCol, starSumRow };
    }

    /**
     * This returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with higher priority) requested a fixed pixel width.
     * 
     * If the underlying resolvedLayoutInformation returns null
     * because we're waiting on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalFixedColumnAllocation(): number | undefined {
        return this.resolvedLayoutInformation?.widthSpecifiers.reduce(
            (sum, { magnitude, unit }) => sum + (unit === DimUnit.Pixel ? magnitude : 0), 0);
    }

    @computed
    private get totalFixedRowAllocation(): number | undefined {
        return this.resolvedLayoutInformation?.heightSpecifiers.reduce(
            (sum, { magnitude, unit }) => sum + (unit === DimUnit.Pixel ? magnitude : 0), 0);
    }

    /**
     * @returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with lower priority) requested a certain relative proportion of the
     * remaining pixel width not allocated for fixed widths.
     * 
     * If the underlying totalFixedColumnAllocation returns undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalColumnRatioAllocation(): number | undefined {
        const layoutInfoLen = this.resolvedLayoutInformation.widthSpecifiers.length;
        if (layoutInfoLen > 0 && this.totalFixedColumnAllocation !== undefined) {
            return this.props.PanelWidth() - (this.totalFixedColumnAllocation + resizerWidth * (layoutInfoLen - 1)) - 2 * NumCast(this.props.Document._xMargin);
        }
    }

    @computed
    private get totalRowRatioAllocation(): number | undefined {
        const layoutInfoLen = this.resolvedLayoutInformation.heightSpecifiers.length;
        if (layoutInfoLen > 0 && this.totalFixedRowAllocation !== undefined) {
            return this.props.PanelHeight() - (this.totalFixedRowAllocation + resizerHeight * (layoutInfoLen - 1)) - 2 * NumCast(this.props.Document._yMargin);
        }
    }

    /**
     * @returns the total quantity, in pixels, that
     * 1* (relative / star unit) is worth. For example,
     * if the configuration has three documents, with, respectively,
     * widths of 2*, 2* and 1*, and the panel width returns 1000px,
     * this accessor returns 1000 / (2 + 2 + 1), or 200px.
     * Elsewhere, this is then multiplied by each relative-width
     * document's (potentially decimal) * count to compute its actual width (400px, 400px and 200px).
     * 
     * If the underlying totalColumnRatioAllocation or this.resolveLayoutInformation return undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get columnUnitLength(): number | undefined {
        if (this.resolvedLayoutInformation && this.totalColumnRatioAllocation !== undefined) {
            return this.totalColumnRatioAllocation / 4; // this.resolvedLayoutInformation.starSumCol;
        }
    }

    @computed
    private get rowUnitLength(): number | undefined {
        if (this.resolvedLayoutInformation && this.totalRowRatioAllocation !== undefined) {
            //return this.totalRowRatioAllocation / Math.ceil(this.resolvedLayoutInformation.starSumRow / 4);
            //console.log(this.totalRowRatioAllocation / Math.ceil(this.ratioDefinedDocs.length / 4));
            return this.totalRowRatioAllocation / Math.ceil(this.ratioDefinedDocs.length / 4);
        }
    }

    /**
     * This wrapper function exists to prevent mobx from
     * needlessly rerendering the internal ContentFittingDocumentViews
     */
    private getColumnUnitLength = () => this.columnUnitLength;

    private getRowUnitLength = () => this.rowUnitLength;

    /**
     * @param layout the document whose transform we'd like to compute
     * Given a layout document, this function
     * returns the resolved width it has requested, in pixels.
     * @returns the stored column width if already in pixels,
     * or the ratio width evaluated to a pixel value
     */
    private lookupWidthPixels = (layout: Doc): number => {
        const columnUnitLength = this.columnUnitLength;
        if (columnUnitLength === undefined) {
            return 0; // we're still waiting on promises to resolve
        }
        let width = NumCast(layout.dimMagnitude, 1);
        if (StrCast(layout.dimUnit, "*") === DimUnit.Ratio) {
            width *= columnUnitLength;
        }
        return width;
    }

    private lookupHeightPixels = (layout: Doc): number => {
        const rowUnitLength = this.rowUnitLength;
        if (rowUnitLength === undefined) {
            return 0; // we're still waiting on promises to resolve
        }
        let height = NumCast(layout.dimMagnitude, 1);
        if (StrCast(layout.dimUnit, "*") === DimUnit.Ratio) {
            height = rowUnitLength;
        }
        return height;
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layoutInput: Doc) => {
        const columnUnitLength = this.columnUnitLength;
        const rowUnitLength = this.rowUnitLength;
        if (columnUnitLength === undefined || rowUnitLength === undefined) {
            return Transform.Identity(); // we're still waiting on promises to resolve
        }
        let columnOffset = 0;
        let rowOffset = 0;
        for (let i = 0; i < this.childLayoutPairs.length; i++) {
            const { layout: candidate } = this.childLayoutPairs[i];
            //{ layout: candidate } of this.childLayoutPairs) {
            if (candidate === layoutInput) {
                //return this.props.ScreenToLocalTransform().translate(-columnOffset, -rowOffset);
                return this.props.ScreenToLocalTransform().translate(-columnOffset, -rowOffset);
            }

            if (i % 4 === 3) {
                columnOffset = 0;
                rowOffset += this.lookupHeightPixels(candidate) + resizerHeight;
            }
            else {
                columnOffset += this.lookupWidthPixels(candidate) + resizerWidth;
            }

        }
        return Transform.Identity(); // type coersion, this case should never be hit
    }

    @undoBatch
    @action
    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        if (super.onInternalDrop(e, de)) {
            de.complete.docDragData?.droppedDocuments.forEach(action((d: Doc) => {
                d.dimUnit = "*";
                d.dimMagnitude = 1;
            }));
        }
        return false;
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
    /**
     * @returns the resolved list of rendered child documents, displayed
     * at their resolved pixel widths, each separated by a resizer. 
     */
    @computed
    private get contents(): JSX.Element[] | null {
        const { childLayoutPairs } = this;
        const { Document, PanelHeight, PanelWidth } = this.props;
        const collector: JSX.Element[] = [];
        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const dxf = () => this.lookupIndividualTransform(layout).translate(-NumCast(Document._xMargin), -NumCast(Document._yMargin));
            const width = () => this.lookupWidthPixels(layout);
            const height = () => this.lookupHeightPixels(layout);
            collector.push(
                <div className={"document-wrapper"}
                    key={"wrapper" + i}
                    style={{ width: width() }} >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                    <WidthLabel
                        layout={layout}
                        collectionDoc={Document}
                    />
                </div>,
                <ColumnResizeBar
                    width={resizerWidth}
                    key={"resizer" + i}
                    select={this.props.select}
                    columnUnitLength={this.getColumnUnitLength}
                    toLeft={layout}
                    toRight={childLayoutPairs[i + 1]?.layout}
                />
            );
        }
        //collector.pop(); // removes the final extraneous resize bar
        return collector;
    }

    render(): JSX.Element {
        return (
            <div className={"collectionMulticolumnView_contents"}
                style={{
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin)
                }} ref={this.createDashEventsTarget}>
                {this.contents}
            </div>
        );
    }
}

