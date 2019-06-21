import * as React from 'react';
import { observer } from 'mobx-react';
import "./NaviconButton.scss";
import * as $ from 'jquery';
import { observable } from 'mobx';


export class NaviconButton extends React.Component {

    @observable ref: React.RefObject<HTMLAnchorElement> = React.createRef();

    componentDidMount = () => {
        // this.ref = React.createRef();
        // $(document).ready(function () {
        //     var hamburger = $('#hamburger-icon');
        //     hamburger.click(function () {
        //         hamburger.toggleClass('active');
        //         console.log("toggling 1")
        //         return false;
        //     });
        // });

        // document.addEventListener("click", this.toggle)

        let that = this;

        if(this.ref.current){this.ref.current.addEventListener("click", function(e) {
            e.preventDefault();
            if(that.ref.current){
                that.ref.current.classList.toggle('active');
                console.log("toggling 2")
                return false;
            }
        })}
        
    }

    // toggle = (e: MouseEvent) => {
    //     this.ref.current.toggleClass('active');
    //     console.log("toggling 2")
    //     return false;
    // }

    render() {
        return (
            <a id="hamburger-icon" href="#" ref = {this.ref} title="Menu">
                <span className="line line-1"></span>
                <span className="line line-2"></span>
                <span className="line line-3"></span>
            </a>
        );
    }
}