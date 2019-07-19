import React = require("react");
import { observer } from "mobx-react";
import { observable, runInAction } from "mobx";
import { RectangleTemplate } from "./FaceRectangles";

@observer
export default class FaceRectangle extends React.Component<{ rectangle: RectangleTemplate }> {
    @observable private opacity = 0;

    componentDidMount() {
        runInAction(() => this.opacity = 1);
    }

    render() {
        let rectangle = this.props.rectangle;
        return (
            <div
                onPointerEnter={() => console.log(this.props.rectangle.id)}
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