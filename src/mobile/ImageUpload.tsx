import * as ReactDOM from 'react-dom';
import React = require('react');
import "./ImageUpload.scss"
import { action, runInAction } from "mobx";




const onPointerDown = (e: React.TouchEvent) => {
    let imgInput = document.getElementById("input_image_file");
    if (imgInput) {
        imgInput.click();
    }
}

const onFileLoad = (file: any) => {
    let img = new Image();
    let imgPrev = document.getElementById("img_preview")
    if (imgPrev) {
        let files = file.target.files;
        if (files.length != 0) {
            console.log(files[0]);
            console.log(window.location.origin)
            const upload = window.location.origin + "/upload";
            let formData = new FormData();
            formData.append("file", files[0]);
            console.log(window.location.origin + file[0])

            //imgPrev.setAttribute("src", window.location.origin + files[0].name)
        }
    }


}

ReactDOM.render((
    <div className="imgupload_cont">
        {/* <button className="button_file" onTouchStart={onPointerDown}> Open Image </button> */}
        <input type="file" accept="image/*" onChange={onFileLoad} className="input_file" id="input_image_file"></input>
        <img id="img_preview" src=""></img>
    </div>),
    document.getElementById('root')
);