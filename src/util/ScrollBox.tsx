import React = require("react")

export class ScrollBox extends React.Component {
    onWheel = (e: React.WheelEvent) => {
        if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight) { // If the element has a scroll bar, then we don't want the containing collection to zoom
            e.stopPropagation();
        }
    }

    render() {
        return (
            <div style={{
                overflow: "auto",
                width: "100%",
                height: "100%",
            }} onWheel={this.onWheel}>
                {this.props.children}
            </div>
        )
    }
}