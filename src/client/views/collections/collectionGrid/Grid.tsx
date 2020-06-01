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
    layout: Layout[];
    numCols: number;
    rowHeight: number;
    setLayout: Function;
    transformScale: number;
    childrenDraggable: boolean;
}

/**
 * Wrapper around the actual GridLayout of `react-grid-layout`.
 */
@observer
export default class Grid extends React.Component<GridProps> {

    constructor(props: Readonly<GridProps>) {
        super(props);
        this.onLayoutChange = this.onLayoutChange.bind(this);
    }
    /**
     * If there has been a change in layout, calls a method in CollectionGridView to set the layouts on the Document.
     * @param layout `Layout[]`
     */
    onLayoutChange(layout: Layout[]) {
        this.props.setLayout(layout);
    }

    render() {
        console.log(this.props.transformScale);
        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={this.props.numCols}
                rowHeight={this.props.rowHeight}
                width={this.props.width}
                compactType={null}
                isDroppable={true}
                // isDraggable={this.props.childrenDraggable}
                // useCSSTransforms={true}
                margin={[10, 10]}
                onLayoutChange={this.onLayoutChange}
                preventCollision={false} // change this to true later
            // transformScale={2} // 1.2/scale
            >
                {this.props.nodeList}
            </GridLayout >
        );
    }
}
