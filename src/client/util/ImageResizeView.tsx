import { NodeSelection } from "prosemirror-state";
import { Doc } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { DocumentManager } from "./DocumentManager";
import React = require("react");

import { schema } from "./schema_rts";

interface IImageResizeView {
    node: any;
    view: any;
    getPos: any;
    addDocTab: any;
}

export class ImageResizeView extends React.Component<IImageResizeView> {
    constructor(props: IImageResizeView) {
        super(props);
    }

    onClickImg = (e: any) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.props.view.state.selection.node && this.props.view.state.selection.node.type !== this.props.view.state.schema.nodes.image) {
            this.props.view.dispatch(this.props.view.state.tr.setSelection(new NodeSelection(this.props.view.state.doc.resolve(this.props.view.state.selection.from - 2))));
        }
    }

    onPointerDownImg = (e: any) => {
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            DocServer.GetRefField(this.props.node.attrs.docid).then(async linkDoc =>
                (linkDoc instanceof Doc) &&
                DocumentManager.Instance.FollowLink(linkDoc, this.props.view.state.schema.Document,
                    document => this.props.addDocTab(document, this.props.node.attrs.location ? this.props.node.attrs.location : "inTab"), false));
        }
    }

    onPointerDownHandle = (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        const elementImage = document.getElementById("imageId") as HTMLElement;
        const wid = Number(getComputedStyle(elementImage).width.replace(/px/, ""));
        const hgt = Number(getComputedStyle(elementImage).height.replace(/px/, ""));
        const startX = e.pageX;
        const startWidth = parseFloat(this.props.node.attrs.width);

        const onpointermove = (e: any) => {
            const elementOuter = document.getElementById("outerId") as HTMLElement;

            const currentX = e.pageX;
            const diffInPx = currentX - startX;
            elementOuter.style.width = `${startWidth + diffInPx}`;
            elementOuter.style.height = `${(startWidth + diffInPx) * hgt / wid}`;
        };

        const onpointerup = () => {
            document.removeEventListener("pointermove", onpointermove);
            document.removeEventListener("pointerup", onpointerup);
            const pos = this.props.view.state.selection.from;
            const elementOuter = document.getElementById("outerId") as HTMLElement;
            this.props.view.dispatch(this.props.view.state.tr.setNodeMarkup(this.props.getPos(), null, { ...this.props.node.attrs, width: elementOuter.style.width, height: elementOuter.style.height }));
            this.props.view.dispatch(this.props.view.state.tr.setSelection(new NodeSelection(this.props.view.state.doc.resolve(pos))));
        };

        document.addEventListener("pointermove", onpointermove);
        document.addEventListener("pointerup", onpointerup);
    }

    selectNode() {
        const elementImage = document.getElementById("imageId") as HTMLElement;
        const elementHandle = document.getElementById("handleId") as HTMLElement;

        elementImage.classList.add("ProseMirror-selectednode");
        elementHandle.style.display = "";
    }

    deselectNode() {
        const elementImage = document.getElementById("imageId") as HTMLElement;
        const elementHandle = document.getElementById("handleId") as HTMLElement;

        elementImage.classList.remove("ProseMirror-selectednode");
        elementHandle.style.display = "none";
    }


    render() {

        const outerStyle = {
            width: this.props.node.attrs.width,
            height: this.props.node.attrs.height,
            display: "inline-block",
            overflow: "hidden",
            float: this.props.node.attrs.float
        };

        const imageStyle = {
            width: "100%",
        };

        const handleStyle = {
            position: "absolute",
            width: "20px",
            heiht: "20px",
            backgroundColor: "blue",
            borderRadius: "15px",
            display: "none",
            bottom: "-10px",
            right: "-10px"

        };



        return (
            <div id="outer"
                style={outerStyle}
            >
                <img
                    id="imageId"
                    style={imageStyle}
                    src={this.props.node.src}
                    onClick={this.onClickImg}
                    onPointerDown={this.onPointerDownImg}

                >
                </img>
                <span
                    id="handleId"
                    onPointerDown={this.onPointerDownHandle}
                >

                </span>
            </div >
        );
    }
}