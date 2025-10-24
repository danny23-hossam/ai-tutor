import React from 'react'
import Header from './Header'
import './Mylearning.css'
const Mylearning = () => {
  return (
    <>
    <Header/>

    <header className='mylearningheader'>
   <div className='learnhdiv1 col-10'>
<h5>My Learning</h5>
<p>Continue your learning journey</p>
   </div>
   <div className='learnhdiv2'>
<button className='homebtn' data-bs-toggle="modal" data-bs-target="#exampleModal"><i class="bi bi-plus"></i>Start a New Lesson</button>



<div className="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div className="modal-dialog">
    <div className="modal-content">
       
   
      
        
        <button type="button" className="btn-close " data-bs-dismiss="modal" aria-label="Close"></button>
        <h5 className="modal-title" id="exampleModalLabel">Start a New Lesson</h5>
      
       
          <p className='modp'>Create a new learning session</p>
          <label htmlFor="" className='mt-3 mb-3 modl'>Lesson Title</label>
          <input type="text" className='form-control' placeholder='Enter Lesson Name'/>
     
     
   
      
     <div className='moddiv '>
 <button type="button" className=" mb-4 offset-2 modbtn btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" className=" mb-4 modbtn btn btn-secondary">Create Lesson</button>
     </div>
       
     

    </div>
  </div>
</div>


   </div>

    </header>





























    <main className='learnmain  mt-5'>



       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>




     
       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>


       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>


       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>


       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>


       <div className='div'>
<h6>Newton</h6>
<label htmlFor="">Progress</label>

<div className="progress mb-3">
  <div className="progress-bar lbar" style={{ width: '25%' ,backgroundColor:"black"}}></div>
</div>
<p><i class="bi bi-clock"></i> Total 24 minutes</p>
<button className='col-10 mb-4 '>Resume</button>


       </div>


    </main>


   
    </>
  )
}

export default Mylearning