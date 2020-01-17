import { observer } from 'mobx-react';
import { makeInterface, listSpec } from '../../new_fields/Schema';
import { documentSchema } from '../../new_fields/documentSchemas';
import { CollectionSubView } from './collections/CollectionSubView';
import { DragManager } from '../util/DragManager';
import * as React from "react";
import { Doc, DocListCast } from '../../new_fields/Doc';
import { NumCast, Cast, StrCast } from '../../new_fields/Types';
import { List } from '../../new_fields/List';
import { ContentFittingDocumentView } from './nodes/ContentFittingDocumentView';
import { Utils } from '../../Utils';
import { Transform } from '../util/Transform';
import "./collectionMulticolumnView.scss";
import { computed } from 'mobx';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface Unresolved {
    config: Doc;
    target: Doc;
    magnitude: number;
    unit: string;
}

interface Resolved {
    config: Doc;
    target: Doc;
    pixels: number;
}

const resolvedUnits = ["*", "px"];

@observer
export default class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    /**
     * Returns the list of so-called configuration documents.
     * Each one is a wrapper around what we typically think of as
     * the child document, just also encoding the magnitude and unit
     * of the specified width.
     */
    private get configuration() {
        const { Document } = this.props;
        if (!Document.multicolumnData) {
            Document.multicolumnData = new List<Doc>();
        }
        return DocListCast(this.Document.multicolumnData);
    }

    @computed
    private get resolvedLayoutInformation() {
        const unresolved: Unresolved[] = [];
        let ratioSum = 0, numFixed = 0, numRatio = 0;
        for (const config of this.configuration) {
            const { target, widthMagnitude, widthUnit } = config;
            if (target instanceof Doc) {
                const unit = StrCast(widthUnit);
                const magnitude = NumCast(widthMagnitude);
                if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                    switch (unit) {
                        case "*":
                            ratioSum += magnitude;
                            numRatio++;
                            break;
                        case "px":
                            numFixed++;
                            break;
                    }
                    unresolved.push({ config, target, magnitude, unit });
                }
                // otherwise, the particular configuration entry is ignored and the remaining
                // space is allocated as if the document were absent from the configuration list
            }
        }
        return { unresolved, numRatio, numFixed, ratioSum };
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
    private get totalFixedAllocation(): number | undefined {
        const layout = this.resolvedLayoutInformation;
        if (!layout) {
            return undefined;
        }
        let sum = 0;
        for (const { magnitude, unit } of layout.unresolved) {
            if (unit === "px") {
                sum += magnitude;
            }
        }
        return sum;
    }

    /**
     * This returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with lower priority) requested a certain relative proportion of the
     * remaining pixel width not allocated for fixed widths.
     * 
     * If the underlying totalFixedAllocation returns undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalRatioAllocation(): number | undefined {
        const { totalFixedAllocation } = this;
        return totalFixedAllocation !== undefined ? this.props.PanelWidth() - totalFixedAllocation : undefined;
    }

    /**
     * This returns the total quantity, in pixels, that
     * 1* (relative / star unit) is worth. For example,
     * if the configuration had three documents, with, respectively,
     * widths of 2*, 2* and 1*, and the panel width was 1000px,
     * this value would return 1000 / (2 + 2 + 1), or 200px.
     * This is then multiplied by each relative-width
     * document's * factor to compute its actual width (400px, 400px and 200px).
     * 
     * If the underlying totalRatioAllocation or this.resolveLayoutInformation return undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get columnUnitLength(): number | undefined {
        const layout = this.resolvedLayoutInformation;
        const { totalRatioAllocation } = this;
        if (layout !== null && totalRatioAllocation !== undefined) {
            const { ratioSum, unresolved } = layout;
            return (totalRatioAllocation - 2 * (unresolved.length - 1)) / ratioSum;
        }
        return undefined;
    }

    @computed
    private get contents(): JSX.Element[] | null {
        const layout = this.resolvedLayoutInformation;
        const columnUnitLength = this.columnUnitLength;
        if (layout === null || columnUnitLength === undefined) {
            return (null); // we're still waiting on promises to resolve
        }
        const resolved: Resolved[] = [];
        layout.unresolved.forEach(value => {
            const { unit, magnitude, ...remaining } = value;
            let width = magnitude;
            if (unit === "*") {
                width = magnitude * columnUnitLength;
            }
            resolved.push({ pixels: width, ...remaining, });
        });
        const collector: JSX.Element[] = [];
        for (let i = 0; i < resolved.length; i++) {
            const { target, pixels, config } = resolved[i];
            collector.push(<ContentFittingDocumentView
                {...this.props}
                key={Utils.GenerateGuid()}
                Document={target}
                DataDocument={undefined}
                PanelWidth={() => pixels}
                getTransform={this.props.ScreenToLocalTransform}
            />);
            collector.push(
                <MulticolumnSpacer
                    key={Utils.GenerateGuid()}
                    columnUnitLength={columnUnitLength}
                    toLeft={config}
                    toRight={resolved[i + 1]?.config}
                />
            );
        }
        collector.pop(); // not the cleanest, but simply removes the final extraneous spacer
        return collector;
    }

    render() {
        return (
            <div className={"collectionMulticolumnView_contents"}>
                {this.contents}
            </div>
        );
    }

}

interface SpacerProps {
    columnUnitLength: number;
    toLeft?: Doc;
    toRight?: Doc;
}

class MulticolumnSpacer extends React.Component<SpacerProps> {

    private registerResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnUnitLength } = this.props;
        const target = movementX > 0 ? toRight : toLeft;
        if (target) {
            const { widthUnit, widthMagnitude } = target;
            if (widthUnit === "*") {
                target.widthMagnitude = NumCast(widthMagnitude) - Math.abs(movementX) / columnUnitLength;
            }
        }
    }

    private onPointerUp = () => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"spacer"}
                onPointerDown={this.registerResizing}
            />
        );
    }

}