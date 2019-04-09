import "react-image-lightbox/style.css"; // This only needs to be imported once in your app
import React = require("react");
import { observer } from "mobx-react";
import "react-pdf/dist/Page/AnnotationLayer.css";

interface IProps {
  Height: number;
  Width: number;
  X: number;
  Y: number;
}

/**
 * Sticky, also known as area highlighting, is used to highlight large selection of the PDF file.
 * Improvements that could be made: maybe store line array and store that somewhere for future rerendering.
 *
 * Written By: Andrew Kim
 */
@observer
export class Sticky extends React.Component<IProps> {
  private initX: number = 0;
  private initY: number = 0;

  private _ref = React.createRef<HTMLCanvasElement>();
  private ctx: any; //context that keeps track of sticky canvas

  /**
   * drawing. Registers the first point that user clicks when mouse button is pressed down on canvas
   */
  drawDown = (e: React.PointerEvent) => {
    if (this._ref.current) {
      this.ctx = this._ref.current.getContext("2d");
      let mouse = e.nativeEvent;
      this.initX = mouse.offsetX;
      this.initY = mouse.offsetY;
      this.ctx.beginPath();
      this.ctx.lineTo(this.initX, this.initY);
      this.ctx.strokeStyle = "black";
      document.addEventListener("pointermove", this.drawMove);
      document.addEventListener("pointerup", this.drawUp);
    }
  }

  //when user drags
  drawMove = (e: PointerEvent): void => {
    //x and y mouse movement
    let x = (this.initX += e.movementX),
      y = (this.initY += e.movementY);
    //connects the point
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }

  /**
   * when user lifts the mouse, the drawing ends
   */
  drawUp = (e: PointerEvent) => {
    this.ctx.closePath();
    console.log(this.ctx);
    document.removeEventListener("pointermove", this.drawMove);
  }

  render() {
    return (
      <div onPointerDown={this.drawDown}>
        <canvas
          ref={this._ref}
          height={this.props.Height}
          width={this.props.Width}
          style={{
            position: "absolute",
            top: "20px",
            left: "0px",
            zIndex: 1,
            background: "yellow",
            transform: `translate(${this.props.X}px, ${this.props.Y}px)`,
            opacity: 0.4
          }}
        />
      </div>
    );
  }
}
