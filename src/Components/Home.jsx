import React from 'react'
import Header from './Header'
import './Home.css'

const Home = () => {
  return (
    <>
     <Header/>

     <header className='homeheader'>
    <h2>Welcome back ,Danny</h2>
    <p className='homeheaderp'>Ready to continue your learning journey</p>
    <div className='homeheaderouterdiv'>
         <i class="bi bi-lightning-charge-fill icond"></i>
         <div className='indiv1'>
          <p className='indiv1p1'>Physics</p>
          <p className='indiv1p2'>Newton Second<sup>'</sup>s Law</p>
          <div className='hdiv2'>
 <label htmlFor="" className='hlabel'>Progress</label>
 <label htmlFor="" className='label2'>68%</label>
<div className="progress" role="progressbar" aria-label="Basic example" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100">
  <div className="progress-bar bar" ></div>
</div>
           <p className='labelp'>12 min left</p>
          </div>
          
         </div>

         <button className='homebtn'> <i class="bi bi-caret-right"></i>Continue</button>
        
         
       
        
    </div>
     </header>






<h5 className='h5'>This Week</h5>
<main className='mainn'>
 <div className='thisweekdiv'>

<div className='weekdiv2'>
<p> <i class="bi bi-clock c"></i> Study Time</p>
<p className='weekp fw-bold'>12h 30m</p>
</div>
 </div>

     <div className='thisweekdiv'>
      <div className='weekdiv2'>
  <p><i class="bi bi-skip-end-circle"></i> Sessions</p>
  <p className='weekp fw-bold'>18</p>
</div>
      </div>     



      <div className='thisweekdiv'>
        <div className='weekdiv2'>
  <p>  <i class="bi bi-lightning-charge"></i> Streak</p>
  <p className='weekp fw-bold'>7 days</p>
  </div>
        
        </div>      
</main>




    </>
   
  )
}

export default Home