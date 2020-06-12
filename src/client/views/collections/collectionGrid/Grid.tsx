import * as React from 'react';
import { observer } from "mobx-react";

import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";

import * as GridLayout from 'react-grid-layout';
import { Layout } from 'react-grid-layout';
export { Layout } from 'react-grid-layout';


interface GridProps {
    width: number;
    nodeList: JSX.Element[] | null;
    layout: Layout[] | undefined;
    numCols: number;
    rowHeight: number;
    setLayout: (layout: Layout[]) => void;
    transformScale: number;
    childrenDraggable: boolean;
    preventCollision: boolean;
    compactType: string;
    margin: number;
}

/**
 * Wrapper around the actual GridLayout of `react-grid-layout`.
 */
@observer
export default class Grid extends React.Component<GridProps> {
    render() {
        const compactType = this.props.compactType === "vertical" || this.props.compactType === "horizontal" ? this.props.compactType : null;
        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={this.props.numCols}
                rowHeight={this.props.rowHeight}
                width={this.props.width}
                compactType={compactType}
                isDroppable={true}
                isDraggable={this.props.childrenDraggable}
                isResizable={this.props.childrenDraggable}
                useCSSTransforms={true}
                onLayoutChange={this.props.setLayout}
                preventCollision={this.props.preventCollision}
                transformScale={1 / this.props.transformScale} // still doesn't work :(
                style={{ zIndex: 5 }}
                margin={[this.props.margin, this.props.margin]}
            >
                {this.props.nodeList}
            </GridLayout>
        );
    }
}
