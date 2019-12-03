import React = require("react");
import { observer } from "mobx-react";
import { observable, runInAction } from "mobx";
import { RectangleTemplate } from "./FaceRectangles";

@observer
export default class FaceRectangle extends React.Component<{ rectangle: RectangleTemplate }> {
    @observable private opacity = 0;

    componentDidMount() {
        setTimeout(() => runInAction(() => this.opacity = 1), 500);
    }

    render() {
        const rectangle = this.props.rectangle;
        return (
            <div
                style={{
                    ...rectangle.style,
                    opacity: this.opacity,
                    transition: "1s ease opacity",
                    position: "absolute",
                    borderRadius: 5
                }}
            />
        );
    }

}